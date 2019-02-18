package main

import (
	"context"
	"errors"
	"fmt"
	"html/template"
	"net/http"
	"os"

	"github.com/go-chi/chi"
	"github.com/syntaqx/go-chi-render"
)

var db *DB
var indexHTML *template.Template
var viewLinkHTML *template.Template

type TemplateContextKey string

const TemplateKey TemplateContextKey = "template"

func WithTemplate(r *http.Request, t *template.Template) *http.Request {
	c := r.Context()
	return r.WithContext(context.WithValue(c, TemplateKey, t))
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

	r := chi.NewRouter()

	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		if indexHTML == nil {
			// TODO: We need to move the parsing of markdown templates somewhere so that
			// the tests can pick them up and we can assert on them - perhaps we should also
			// provide a way for the tests to mock these.
			indexHTML, err = template.ParseFiles("./index.mustache.html")
			if err != nil {
				panic(err)
			}
		}
		render.Render(w, WithTemplate(r, indexHTML), &Link{})
	})

	r.Post("/", func(w http.ResponseWriter, r *http.Request) {
		// Pass an empty string to simulate an "optional" argument
		link := &Link{}

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

		// Only render with 302 status for non-JSON responses
		if render.GetAcceptedContentType(r) != render.ContentTypeJSON {
			//render.Status(r, http.StatusFound)
			w.Header().Set("Location", link.URL)
			w.WriteHeader(http.StatusFound)
		}
		if viewLinkHTML == nil {
			viewLinkHTML, err = template.ParseFiles("./link.view.mustache.html")
			if err != nil {
				panic(err)
			}
		}
		render.Render(w, WithTemplate(r, viewLinkHTML), link)
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
		if t, ok := r.Context().Value(TemplateKey).(*template.Template); ok && t != nil {
			err := t.Execute(w, v)
			if err != nil {
				render.Render(w, r, ErrInternalServer(err))
			}
			return
		}
	}
	render.PlainText(w, r, fmt.Sprint(v))
}

func main() {
	ESUrl := os.Getenv("ES_URL")
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
