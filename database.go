package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"io/ioutil"
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
	GenerateID() error
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

func createURL(ur *url.URL, path []string) string {
	u := new(url.URL)
	u.Scheme = ur.Scheme
	u.Host = ur.Host
	u.User = ur.User
	escapedPath := make([]string, len(path))
	for i, s := range path {
		escapedPath[i] = url.PathEscape(s)
	}
	u.Path = "/" + strings.Join(escapedPath, "/")

	return u.String()
}

func getRequest(path string) (*http.Response, error) {
	request, err := http.NewRequest("GET", path, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Add("Accept", "application/json")
	return client.Do(request)
}

func putRequest(path string, jsonbytes []byte) (*http.Response, error) {
	request, err := http.NewRequest("PUT", path, bytes.NewBuffer(jsonbytes))
	if err != nil {
		return nil, err
	}
	request.Header.Add("Content-Type", "application/json")
	request.Header.Add("Accept", "application/json")
	return client.Do(request)
}

// Migrate makes sure that the Elastic cluster is primed for data
func (db *DB) Migrate(m Model) error {
	response, err := getRequest(createURL(db.URL, []string{m.Index()}))
	if err != nil {
		return err
	}
	if response.StatusCode != http.StatusOK {
		response, err := putRequest(createURL(db.URL, []string{m.Index()}), []byte(`{"settings": {"index": {"number_of_shards": 1}}}`))
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

	response, err = putRequest(createURL(db.URL, []string{m.Index(), "_mappings", strings.ToLower(modelName)}), jsonBytes)
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
		// Generate and ID that does not exist in the database
		for true {
			err := link.GenerateID()
			if err != nil {
				return nil, err
			}

			// Check if the newly generate ID exists in DB
			exists, err := db.Exists(link)
			if err != nil {
				return nil, err
			}

			// If the ID is not found in the DB we can break
			// the loop because we have a unique ID
			if !exists {
				break
			}
		}
	}

	jsonbytes, err := json.Marshal(link)
	if err != nil {
		return nil, err
	}

	response, err := putRequest(createURL(db.URL, []string{"links", "link", link.ID}), jsonbytes)
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

func (db *DB) Exists(m Model) (bool, error) {
	modelType := reflect.TypeOf(m)
	modelName := strings.ToLower(modelType.Elem().Name())
	ID := reflect.ValueOf(m).Elem().FieldByName("ID").String()

	response, err := getRequest(createURL(db.URL, []string{m.Index(), modelName, ID, "_source"}))
	if err != nil {
		return false, err
	}

	if response.StatusCode != http.StatusOK {
		return false, nil
	}

	return true, nil
}

func (db *DB) Get(m Model) error {
	modelType := reflect.TypeOf(m)
	modelName := strings.ToLower(modelType.Elem().Name())
	ID := reflect.ValueOf(m).Elem().FieldByName("ID").String()

	response, err := getRequest(createURL(db.URL, []string{m.Index(), modelName, ID, "_source"}))
	if err != nil {
		return err
	}

	if response.StatusCode != http.StatusOK {
		return errors.New("Link not found in database")
	}

	jsonResponse(response, &m)

	return nil
}
