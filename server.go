package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"

	"github.com/cbroglie/mustache"
	"github.com/go-chi/chi"
	"github.com/syntaqx/render"
)

var db *DB
var indexHTML *mustache.Template
var viewLinkHtml *mustache.Template

type TemplateContextKey string

const TemplateKey TemplateContextKey = "template"

func WithTemplate(r *http.Request, t *mustache.Template) *http.Request {
	c := r.Context()
	return r.WithContext(context.WithValue(c, TemplateKey, t))
}

type Link struct {
	ID  string `json:"id" form:"id"`
	URL string `json:"url" form:"url,omitempty"`
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

func (e *ErrResponse) Render(w http.ResponseWriter, r *http.Request) error {
	e.StatusText = http.StatusText(e.StatusCode)
	e.ErrorText = e.Err.Error()
	render.Status(r, e.StatusCode)
	return nil
}

func (link *Link) Render(w http.ResponseWriter, r *http.Request) error {
	return nil
}

func (link *Link) Bind(r *http.Request) error {
	if link.URL == "" {
		return errors.New("Malformed URL")
	}
	url, err := url.Parse(link.URL)
	if err != nil {
		return err
	}
	if url.Host == "" || url.Scheme == "" {
		return errors.New("Malformed URL")
	}
	return nil
}

func CreateServer(dbURL string) (*chi.Mux, error) {
	var err error
	db, err = NewDB(dbURL)
	if err != nil {
		return nil, err
	}

	render.Respond = Respond

	r := chi.NewRouter()

	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		render.Render(w, WithTemplate(r, indexHTML), &Link{})
	})

	r.Post("/", func(w http.ResponseWriter, r *http.Request) {
		link := &Link{}

		if err := render.Bind(r, link); err != nil {
			render.Render(w, r, ErrInvalidRequest(err))
			return
		}

		_, err := db.AddLink(link)
		if err != nil {
			render.Render(w, r, ErrInternalServer(err))
		}

		render.Status(r, http.StatusCreated)
		w.Header().Set("Location", link.URL)
		render.Render(w, r, link)
	})

	r.Post("/{id}", func(w http.ResponseWriter, r *http.Request) {
		link := &Link{}

		link.ID = chi.URLParam(r, "id")

		if err := render.Bind(r, link); err != nil {
			render.Render(w, r, ErrInvalidRequest(err))
			return
		}

		_, err := db.AddLink(link)
		if err != nil {
			render.Render(w, r, ErrInternalServer(err))
		}

		render.Status(r, http.StatusCreated)
		w.Header().Set("Location", link.URL)
		render.Render(w, r, link)
	})

	r.Get("/{id}", func(w http.ResponseWriter, r *http.Request) {
		ID := chi.URLParam(r, "id")
		link, err := db.GetLink(ID)
		if err != nil {
			render.Render(w, r, ErrNotFound(err))
			return
		}
		render.Status(r, http.StatusFound)
		w.Header().Set("Location", link.URL)
		render.Render(w, WithTemplate(r, viewLinkHtml), link)
	})
	return r, nil
}

func Respond(w http.ResponseWriter, r *http.Request, v interface{}) {
	// Format response based on request Accept header.
	switch render.GetAcceptedContentType(r) {
	case render.ContentTypeJSON:
		render.JSON(w, r, v)
	default:
		t, ok := r.Context().Value(TemplateKey).(*mustache.Template)
		if ok {
			html, err := t.Render(v)
			if err != nil {
				render.Render(w, r, ErrInternalServer(err))
			} else {
				render.HTML(w, r, html)
			}
		} else {
			render.XML(w, r, v)
		}
	}
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
	indexHTML, err = mustache.ParseFile("./index.mustache.html")
	if err != nil {
		panic(err)
	}
	viewLinkHtml, err = mustache.ParseFile("./link.view.mustache.html")
	if err != nil {
		panic(err)
	}
	http.ListenAndServe(":3000", r)
}
