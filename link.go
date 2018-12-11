package main

import (
	"errors"
	"net/http"
	"net/url"
	"time"
)

type Link struct {
	ID        string    `json:"id" form:"id"`
	URL       string    `json:"url" form:"url,omitempty"`
	Timestamp time.Time `json:"@timestamp" form:"@timestamp"`
}

func (l *Link) String() string {
	return l.URL
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
