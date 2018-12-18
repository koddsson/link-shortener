package main

import (
	"errors"
	"net/http"
	"net/url"
	"time"
)

// Link describes a link in the database
type Link struct {
	ID        string    `json:"id" form:"id"`
	URL       string    `json:"url" form:"url,omitempty" db:"url;type:text;analyzer:standard"`
	Timestamp time.Time `json:"@timestamp" form:"@timestamp" db:"@timestamp;type:date"`
}

func (link *Link) String() string {
	return link.URL
}

// Render is a `go-chi` middleware
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

// Index returns the Elastic index name
func (link *Link) Index() string {
	return "links"
}
