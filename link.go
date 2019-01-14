package main

import (
	"errors"
	"fmt"
	"math/rand"
	"net/http"
	"net/url"
	"time"
)

// Link describes a link in the database
type Link struct {
	ID  string `json:"id" form:"id"`
	URL string `json:"url" form:"url,omitempty" db:"url;type:text;analyzer:standard"`

	HitCount int64 `json:"-" form:"-" db:"hit_count;type:long"`
	HitLimit int64 `json:"limit,omitempty" form:"limit,omitempty" db:"hit_limit;type:long"`

	// TODO: Rename this? This is the created time.
	Timestamp time.Time `json:"@timestamp" form:"@timestamp" db:"@timestamp;type:date"`
}

func (link *Link) String() string {
	return link.URL
}

// Render is a `go-chi` middleware
func (link *Link) Render(w http.ResponseWriter, r *http.Request) error {
	// Make sure we omit the hit limit in any response
	link.HitLimit = 0
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

// GenerateID will set the ID of the link to a randomly generated ID
func (link *Link) GenerateID() error {
	s := rand.New(rand.NewSource(link.Timestamp.UnixNano()))

	// Add a new randomly generated alpha character to the id
	link.ID = link.ID + fmt.Sprintf("%s", string(byte(97+s.Intn(25))))

	return nil
}

// Prepare makes sure that the Link has a ID and a Timestamp
func (link *Link) Prepare() error {
	if link.Timestamp.IsZero() {
		link.Timestamp = time.Now()
	}

	return nil
}

// CanRead tells you if you can read this object
func (link *Link) CanRead() bool {
	if link.HitLimit == 0 {
		return true
	}

	if link.HitCount >= link.HitLimit {
		return false
	}

	return true
}
