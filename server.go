package main

import (
	"context"
	"errors"
	"fmt"
	"html/template"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strings"

	"github.com/go-chi/chi"
	"github.com/minio/minio-go"
	"github.com/syntaqx/go-chi-render"
)

var db *DB
var S3Client *minio.Client
var S3SpaceName string
var S3Endpoint string

type contextKey struct{ name string }

var templates map[string]*template.Template = make(map[string]*template.Template)

var templateKey = &contextKey{"template"}

func WithTemplate(r *http.Request, t string) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), templateKey, t))
}

func ErrInvalidRequest(err error) render.Renderer {
	return &ErrResponse{
		Err:        err,
		StatusCode: http.StatusBadRequest,
	}
}

func ErrInternalServer(err error) render.Renderer {
	return &ErrResponse{
		Err:        err,
		StatusCode: http.StatusInternalServerError,
	}
}

func ErrNotFound(err error) render.Renderer {
	return &ErrResponse{
		Err:        err,
		StatusCode: http.StatusNotFound,
	}
}

type ErrResponse struct {
	Err error `json:"-"` // low-level runtime error

	StatusCode int    `json:"code"`            // user-level status message
	StatusText string `json:"status"`          // user-level status message
	ErrorText  string `json:"error,omitempty"` // application-level error message, for debugging
}

func (e *ErrResponse) String() string {
	return e.ErrorText
}

func (e *ErrResponse) Render(w http.ResponseWriter, r *http.Request) error {
	e.StatusText = http.StatusText(e.StatusCode)
	e.ErrorText = e.Err.Error()
	render.Status(r, e.StatusCode)
	return nil
}

func CreateServer(dbURL string) (*chi.Mux, error) {
	var err error
	db, err = NewDB(dbURL)
	if err != nil {
		return nil, err
	}
	err = db.Migrate(&Link{})
	if err != nil {
		return nil, err
	}

	render.Respond = Respond
	render.Decode = Decode

	r := chi.NewRouter()

	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		render.Render(w, WithTemplate(r, "index"), &Link{})
	})

	r.Post("/", func(w http.ResponseWriter, r *http.Request) {
		// Pass an empty string to simulate an "optional" argument
		link := &Link{}

		if err := render.Bind(r, link); err != nil {
			render.Render(w, r, ErrInvalidRequest(err))
			return
		}

		// https://github.com/minio/minio-go/blob/93e12e097cf3aec86c28ceeb7a960a29b2302a3a/api-put-object.go#L133
		if link.Type == TYPE_FILE {
			// We need to save the link object so that database will generate a ID
			// that we can use to upload the file to S3 with.
			err := db.Save(link)
			if err != nil {
				render.Render(w, r, ErrInternalServer(err))
			}

			_, err = S3Client.PutObject(S3SpaceName, link.ID, link.File, -1, minio.PutObjectOptions{})
			if err != nil {
				render.Render(w, r, ErrInternalServer(err))
			}
			link.URL = "https://" + S3SpaceName + "." + S3Endpoint + "/" + link.ID

		}

		err := db.Save(link)
		if err != nil {
			render.Render(w, r, ErrInternalServer(err))
		}

		render.Status(r, http.StatusCreated)
		w.Header().Set("Location", link.URL)
		render.Render(w, r, link)
	})

	r.Post("/{id}", func(w http.ResponseWriter, r *http.Request) {
		link := &Link{
			ID: chi.URLParam(r, "id"),
		}

		if err := render.Bind(r, link); err != nil {
			render.Render(w, r, ErrInvalidRequest(err))
			return
		}

		err := db.Save(link)
		if err != nil {
			render.Render(w, r, ErrInternalServer(err))
		}

		render.Status(r, http.StatusCreated)
		w.Header().Set("Location", link.URL)
		render.Render(w, r, link)
	})

	r.Get("/{id}", func(w http.ResponseWriter, r *http.Request) {
		ID := chi.URLParam(r, "id")
		link := &Link{ID: ID}
		err := db.Get(link)

		if !link.CanRead() {
			err = errors.New("Link not found in database")
		}

		if err != nil {
			render.Render(w, r, ErrNotFound(err))
			return
		}

		link.HitCount++
		db.Save(link)

		// TODO: If this is a file, "return" the file and don't render

		// Only render with 302 status for non-JSON responses
		if render.GetAcceptedContentType(r) != render.ContentTypeJSON {
			//render.Status(r, http.StatusFound)
			w.Header().Set("Location", link.URL)
			w.WriteHeader(http.StatusFound)
		}

		render.Render(w, WithTemplate(r, "link.view"), link)
	})

	r.Get("/{id}/preview", func(w http.ResponseWriter, r *http.Request) {
		ID := chi.URLParam(r, "id")
		link := &Link{ID: ID}
		err := db.Get(link)

		if !link.CanRead() {
			err = errors.New("Link not found in database")
		}

		if err != nil {
			render.Render(w, r, ErrNotFound(err))
			return
		}

		link.HitCount++
		db.Save(link)

		// TODO: If this is a file, "return" the ID and don't render

		render.Render(w, WithTemplate(r, "link.preview"), link)
	})

	return r, nil
}

func Respond(w http.ResponseWriter, r *http.Request, v interface{}) {
	// Format response based on request Accept header.
	switch render.GetAcceptedContentType(r) {
	case render.ContentTypeJSON:
		render.JSON(w, r, v)
		return
	case render.ContentTypeHTML:
		if t, ok := r.Context().Value(templateKey).(string); ok {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			tpl := templates[t]
			if tpl == nil {
				render.Render(w, r, ErrInternalServer(errors.New("template "+t+" not found")))
			}
			err := tpl.ExecuteTemplate(w, "root", v)
			if err != nil {
				render.Render(w, r, ErrInternalServer(err))
			}
			return
		}
	}
	render.PlainText(w, r, fmt.Sprint(v))
}

func DecodeMultipart(r io.Reader, params map[string]string, v interface{}) error {
	reader := multipart.NewReader(r, params["boundary"])

	for {
		p, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		name := p.FormName()
		if name == "" {
			return errors.New("Unknown multipart field")
		}

		// TODO: Strip EXIF data.
		val := reflect.ValueOf(v).Elem()

		for i := 0; i < val.NumField(); i++ {
			field := val.Type().Field(i)
			value := val.Field(i)

			tags := strings.Split(field.Tag.Get("multipart"), ";")
			if name == tags[0] {
				value.Set(reflect.ValueOf(p))
			}
		}
	}

	return nil
}

func Decode(r *http.Request, v interface{}) error {
	var err error

	mediatype, params, err := mime.ParseMediaType(r.Header.Get("Content-Type"))

	switch mediatype {
	case "application/json":
		err = render.DecodeJSON(r.Body, v)
	case "application/x-www-form-urlencoded":
		err = render.DecodeForm(r.Body, v)
	case "multipart/form-data":
		err = DecodeMultipart(r.Body, params, v)
	default:
		err = errors.New("render: unable to automatically decode the request content type")
	}

	return err
}

func init() {
	files, err := filepath.Glob("*.html")
	if err != nil {
		panic(err)
	}
	for _, t := range files {
		if t == "layout.html" {
			continue
		}
		tpl, err := template.ParseFiles("layout.html", t)
		if err != nil {
			panic(err)
		}
		t = strings.TrimSuffix(filepath.Base(t), filepath.Ext(t))
		templates[t] = tpl
	}
}

func main() {
	var err error

	ESUrl := os.Getenv("ES_URL")
	S3AccessKey := os.Getenv("SPACES_KEY")
	S3SecurityKey := os.Getenv("SPACES_SECRET")
	S3SpaceName = os.Getenv("SPACES_NAME") // Space names must be globally unique
	S3Endpoint = os.Getenv("SPACES_ENDPOINT")

	// TODO: Throw if S3 things aren't defined
	S3Client, err = minio.New(S3Endpoint, S3AccessKey, S3SecurityKey, true)
	if err != nil {
		panic(err)
	}

	if ESUrl == "" {
		panic(errors.New("ES_URL needs to be set"))
	}
	r, err := CreateServer(ESUrl)
	if err != nil {
		panic(err)
	}
	fmt.Println("Up and running on port 3000!")
	http.ListenAndServe(":3000", r)
}
