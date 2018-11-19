package main

import (
	"fmt"
	"github.com/go-chi/chi"
	"github.com/syntaqx/render"
	"net/http"
	"net/url"
	"os"
)

var db *DB

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
	_, err := url.Parse(link.URL)
	if err != nil {
		return err
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
		http.Error(w, http.StatusText(http.StatusBadRequest), http.StatusBadRequest)
		return
	})

	r.Post("/", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, http.StatusText(http.StatusBadRequest), http.StatusBadRequest)
		return
	})

	r.Post("/{id}", func(w http.ResponseWriter, r *http.Request) {
		link := &Link{}

		fmt.Println("Post starting about to call render.Bind")
		if err := render.Bind(r, link); err != nil {
			render.Render(w, r, ErrInvalidRequest(err))
			return
		}

		fmt.Printf("Got fully hydrated link %+v\n", link)
		_, err := db.AddLink(link)
		if err != nil {
			render.Render(w, r, ErrInternalServer(err))
		}
		fmt.Printf("Got back link from DB %+v\n", link)

		render.Status(r, http.StatusCreated)
		render.Render(w, r, link)
	})

	r.Get("/{id}", func(w http.ResponseWriter, r *http.Request) {
		ID := chi.URLParam(r, "id")
		link, err := db.GetLink(ID)
		if err != nil {
			fmt.Printf("GetLink errored %+v\n", err)
			render.Render(w, r, ErrNotFound(err))
			return
		}
		fmt.Printf("got link from db %+v\n", link)
		http.Redirect(w, r, link.URL, http.StatusFound)
	})
	return r, nil
}

func Respond(w http.ResponseWriter, r *http.Request, v interface{}) {
	// Format response based on request Accept header.
	switch render.GetAcceptedContentType(r) {
	case render.ContentTypeJSON:
		render.JSON(w, r, v)
	default:
		render.XML(w, r, v)
	}
}

func main() {
	r, err := CreateServer(os.Getenv("ES_URL"))
	if err != nil {
		panic(err)
	}
	fmt.Println("Up and running!")
	http.ListenAndServe(":3000", r)
}
