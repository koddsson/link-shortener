package main

import (
	"errors"
	"fmt"
	"github.com/go-chi/chi"
	"github.com/syntaqx/render"
	"math/rand"
	"net/http"
)

type Link struct {
	ID  string `json:"id"`
	URL string `json:"url"`
}

func ErrInvalidRequest(err error) render.Renderer {
	return &ErrResponse{
		Err:        err,
		StatusCode: 400,
	}
}

func ErrNotFound(err error) render.Renderer {
	return &ErrResponse{
		Err:        err,
		StatusCode: 404,
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
	return nil
}

var links = []*Link{}

func dbNewLink(link *Link) (*Link, error) {
	link.ID = fmt.Sprintf("%d", rand.Intn(100)+10)
	links = append(links, link)
	return link, nil
}

func dbGetLink(ID string) (*Link, error) {
	for i := range links {
		if links[i].ID == ID {
			return links[i], nil
		}
	}
	return nil, errors.New("Cannot find link by ID " + ID)
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
		ID := chi.URLParam(r, "id")
		link, err := dbGetLink(ID)
		if err != nil {
			render.Render(w, r, ErrNotFound(err))
			return
		}
		http.Redirect(w, r, link.URL, 302)
	})
	return r
}

func main() {
	r := CreateServer()
	http.ListenAndServe(":3000", r)
}
