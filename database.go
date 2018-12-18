package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"math/rand"
	"net/http"
	"net/url"
	"reflect"
	"strings"
)

// Model is a interface that all models must implement
type Model interface {
	Index() string

	// Prepare is a hook that will get called before the model is inserted into the database
	Prepare() error
}

var client = &http.Client{}

// DB is a very simple ORM
type DB struct {
	URL *url.URL
}

// NewDB eases creation by validating the URL
func NewDB(u string) (*DB, error) {
	url, err := url.Parse(u)
	if err != nil {
		return nil, err
	}
	if url.Host == "" || url.Scheme == "" {
		return nil, errors.New("Malformed URL")
	}
	db := &DB{URL: url}
	if err != nil {
		return nil, err
	}
	return db, nil
}

func jsonResponse(r *http.Response, v interface{}) {
	defer io.Copy(ioutil.Discard, r.Body)
	json.NewDecoder(r.Body).Decode(v)
}

func (db *DB) createURL(path string) string {
	u := new(url.URL)
	u.Scheme = db.URL.Scheme
	u.Host = db.URL.Host
	u.User = db.URL.User
	if path[0] != '/' {
		path = "/" + path
	}
	u.Path = path
	return u.String()
}

// Get makes a "GET" request to Elastic
func (db *DB) Get(path string) (*http.Response, error) {
	request, err := http.NewRequest("GET", db.createURL(path), nil)
	if err != nil {
		return nil, err
	}
	request.Header.Add("Accept", "application/json")
	return client.Do(request)
}

// Put makes a "PUT" request to Elastic
func (db *DB) Put(path string, jsonbytes []byte) (*http.Response, error) {
	request, err := http.NewRequest("PUT", db.createURL(path), bytes.NewBuffer(jsonbytes))
	if err != nil {
		return nil, err
	}
	request.Header.Add("Content-Type", "application/json")
	request.Header.Add("Accept", "application/json")
	return client.Do(request)
}

// Migrate makes sure that the Elastic cluster is primed for data
func (db *DB) Migrate(m Model) error {
	response, err := db.Get(m.Index())
	if err != nil {
		return err
	}
	if response.StatusCode != http.StatusOK {
		response, err := db.Put(m.Index(), []byte(`{"settings": {"index": {"number_of_shards": 1}}}`))
		if err != nil {
			return err
		}
		if response.StatusCode != http.StatusOK {
			return errors.New("Could not create index: " + m.Index())
		}
	}

	val := reflect.ValueOf(m).Elem()
	modelName := reflect.TypeOf(m).Elem().Name()
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

	response, err = db.Put(m.Index()+"/_mappings/"+strings.ToLower(modelName), jsonBytes)
	if err != nil {
		return err
	}

	if response.StatusCode != http.StatusOK {
		return errors.New("Could not set mappings for index " + m.Index())
	}
	return nil
}

func (db *DB) AddLink(link *Link) (*Link, error) {
	err := link.Prepare()
	if err != nil {
		return nil, err
	}

	if link.ID == "" {
		s := rand.New(rand.NewSource(link.Timestamp.UnixNano()))
		// Generate and ID that does not exist in the database
		for true {
			// Add a new randomly generated alpha character to the id
			link.ID = link.ID + fmt.Sprintf("%s", string(byte(97+s.Intn(25))))

			// Check if the newly generate ID exists in DB
			foundLink, _ := db.GetLink(link.ID)

			// If the ID is not found in the DB we can break
			// the loop because we have a unique ID
			if foundLink == nil {
				break
			}
		}
	}

	jsonbytes, err := json.Marshal(link)
	if err != nil {
		return nil, err
	}

	response, err := db.Put("/links/link/"+url.PathEscape(link.ID), jsonbytes)
	if err != nil {
		return nil, err
	}

	var dbResponse map[string]string
	jsonResponse(response, &dbResponse)
	result := dbResponse["result"]

	if result != "created" && result != "updated" && result != "noop" {
		return nil, errors.New("Could not insert record got " + dbResponse["result"])
	}

	return link, nil
}

func (db *DB) GetLink(ID string) (*Link, error) {
	var link Link
	response, err := db.Get("/links/link/" + url.PathEscape(ID) + "/_source")
	if err != nil {
		return nil, err
	}

	if response.StatusCode != http.StatusOK {
		return nil, errors.New("Link not found in database")
	}

	jsonResponse(response, &link)

	link.ID = ID

	return &link, nil
}
