package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"reflect"
	"strings"
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

// Migrate makes sure that Elastic is primed to receive data
func (link *Link) Migrate(db *DB) error {
	val := reflect.ValueOf(link).Elem()
	mappings := map[string]interface{}{
		"properties": map[string]interface{}{},
	}
	for i := 0; i < val.NumField(); i++ {
		field := val.Type().Field(i)
		tags := strings.Split(field.Tag.Get("db"), ";")
		name, values := tags[0], tags[1:]
		if name == "" {
			name = field.Name
		}
		if name == "ID" {
			continue
		}
		if len(values) == 0 {
			continue
		}

		mappings["properties"].(map[string]interface{})[name] = map[string]interface{}{}

		for _, element := range values {
			// TODO: Make this DRY
			if strings.HasPrefix(element, "type:") {
				mappings["properties"].(map[string]interface{})[name].(map[string]interface{})["type"] = strings.TrimPrefix(element, "type:")
			}
			if strings.HasPrefix(element, "analyzer:") {
				mappings["properties"].(map[string]interface{})[name].(map[string]interface{})["analyzer"] = strings.TrimPrefix(element, "analyzer:")
			}
		}
	}

	jsonBytes, err := json.Marshal(mappings)
	if err != nil {
		return err
	}

	response, err := db.Put("/links/_mappings/link", jsonBytes)
	if err != nil {
		return err
	}

	if response.StatusCode != http.StatusOK {
		return errors.New("Could not set mappings for index links")
	}
	return nil
}

// Index returns the Elastic index name
func (link *Link) Index() string {
	return "links"
}
