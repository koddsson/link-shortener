package main

import (
	"fmt"
	"github.com/go-chi/chi"
	"github.com/go-chi/render"
	"math/rand"
	"net/http"
)

type Link struct {
	ID  string `json:"id"`
	URL string `json:"url"`
}

func ErrInvalidRequest(err error) render.Renderer {
	return &ErrResponse{
		Err:            err,
		HTTPStatusCode: 400,
		StatusText:     "Bad Request",
		ErrorText:      err.Error(),
	}
}

type ErrResponse struct {
	Err            error `json:"-"` // low-level runtime error
	HTTPStatusCode int   `json:"-"` // http response status code

	StatusText string `json:"status"`          // user-level status message
	AppCode    int64  `json:"code,omitempty"`  // application-specific error code
	ErrorText  string `json:"error,omitempty"` // application-level error message, for debugging
}

func (e *ErrResponse) Render(w http.ResponseWriter, r *http.Request) error {
	render.Status(r, e.HTTPStatusCode)
	return nil
}

func (link *Link) Render(w http.ResponseWriter, r *http.Request) error {
	return nil
}

func (link *Link) Bind(r *http.Request) error {
	return nil
}

var links = []*Link{}

func dbNewLink(link *Link) (*Link, error) {
	link.ID = fmt.Sprintf("%d", rand.Intn(100)+10)
	links = append(links, link)
	return link, nil
}

func CreateServer() *chi.Mux {
	r := chi.NewRouter()
	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, http.StatusText(400), 400)
		return
	})
	r.Post("/", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, http.StatusText(400), 400)
		return
	})
	r.Post("/{id}", func(w http.ResponseWriter, r *http.Request) {
		link := &Link{}

		if err := render.Bind(r, link); err != nil {
			render.Render(w, r, ErrInvalidRequest(err))
			return
		}

		dbNewLink(link)

		render.Status(r, http.StatusCreated)
		render.Render(w, r, link)
	})

	r.Get("/{id}", func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if id == "exists" {
			http.Redirect(w, r, "https://example.com", 302)
			return
		}
		http.Error(w, http.StatusText(404), 404)
	})
	return r
}

func main() {
	r := CreateServer()
	http.ListenAndServe(":3000", r)
}
