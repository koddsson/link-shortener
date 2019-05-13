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
	"time"
)

// Model is a interface that all models must implement
type Model interface {
	// Index is used to determine the name for the Model's Index
	Index() string
	// Prepare is a lifecycle hook that will get called before the model is
	// inserted into or updated in the database.
	Prepare() error
	// GenerateID is a lifecycle hook that will be called before the Model is
	// saved to the database - only if the Model does not already have an ID
	GenerateID() error
}

func modelName(m Model) string {
	return reflect.TypeOf(m).Elem().Name()
}

func modelID(m Model) string {
	return reflect.ValueOf(m).Elem().FieldByName("ID").String()
}

var client = &http.Client{}

// DB is a very simple DBAL for ElasticSearch
type DB struct {
	URL *url.URL
}

// NewDB eases creation by validating the URL given to it
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
		escapedPath[i] = strings.ToLower(url.PathEscape(s))
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
// pass it a struct and it will introspect it to find what fields
// should be added to the Mapping for the index.
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

	response, err = putRequest(createURL(db.URL, []string{m.Index(), "_mappings", modelName(m)}), jsonBytes)
	if err != nil {
		return err
	}

	if response.StatusCode != http.StatusOK {
		bodyBytes, _ := ioutil.ReadAll(response.Body)
		return errors.New("Could not set mappings for index " + m.Index() + ". Response: " + string(bodyBytes))
	}
	return nil
}

// Save will take a Model and either insert it into the database
// if it does not exist (calling Prepare() and GenerateID()) or
// update the existing database record (only calling Prepare())
func (db *DB) Save(m Model) error {
	err := m.Prepare()
	if err != nil {
		return err
	}

	if modelID(m) == "" {
		// Generate and ID that does not exist in the database
		for true {
			err := m.GenerateID()
			if err != nil {
				return err
			}

			// Check if the newly generate ID exists in DB
			exists, err := db.Exists(m)
			if err != nil {
				return err
			}

			// If the ID is not found in the DB we can break
			// the loop because we have a unique ID
			if !exists {
				break
			}
		}
	}

	val := reflect.ValueOf(m).Elem()
	record := map[string]interface{}{}

	for i := 0; i < val.NumField(); i++ {
		field := val.Type().Field(i)

		if tag, ok := field.Tag.Lookup("db"); ok {
			tags := strings.Split(tag, ";")
			name, _ := tags[0], tags[1:]

			if name == "" {
				name = field.Name
			}

			record[name] = val.Field(i).Interface()
		}
	}

	jsonbytes, err := json.Marshal(record)

	if err != nil {
		return err
	}

	response, err := putRequest(createURL(db.URL, []string{m.Index(), modelName(m), modelID(m)}), jsonbytes)
	if err != nil {
		return err
	}

	var dbResponse map[string]string
	jsonResponse(response, &dbResponse)
	result := dbResponse["result"]

	if result != "created" && result != "updated" && result != "noop" {
		return errors.New("Could not insert record got " + dbResponse["result"])
	}

	return nil
}

// Exists will check if the Model already exists in the database
func (db *DB) Exists(m Model) (bool, error) {
	response, err := getRequest(createURL(db.URL, []string{m.Index(), modelName(m), modelID(m), "_source"}))

	if err != nil {
		return false, err
	}

	if response.StatusCode != http.StatusOK {
		return false, nil
	}

	return true, nil
}

func (db *DB) Get(m Model) error {
	response, err := getRequest(createURL(db.URL, []string{m.Index(), modelName(m), modelID(m), "_source"}))
	if err != nil {
		return err
	}

	if response.StatusCode != http.StatusOK {
		return errors.New(modelName(m) + " not found in database")
	}

	record := map[string]interface{}{}
	jsonResponse(response, &record)

	modelElem := reflect.ValueOf(m).Elem()

	for i := 0; i < modelElem.NumField(); i++ {
		field := modelElem.Type().Field(i)
		tags := strings.Split(field.Tag.Get("db"), ";")
		name, _ := tags[0], tags[1:]

		if name == "" {
			name = field.Name
		}

		if recordVal, ok := record[name]; ok {
			if recordVal == nil {
				continue
			}
			switch modelElem.Field(i).Interface().(type) {
			case bool:
				modelElem.Field(i).SetBool(recordVal.(bool))
			case []byte:
				modelElem.Field(i).SetBytes(recordVal.([]byte))
			case complex128:
				modelElem.Field(i).SetComplex(recordVal.(complex128))
			case float64:
				modelElem.Field(i).SetFloat(recordVal.(float64))
			case int64:
				switch recordVal.(type) {
				case int64:
					break
				case float64:
					recordVal = int64(recordVal.(float64))
				}
				modelElem.Field(i).SetInt(recordVal.(int64))
			case string:
				modelElem.Field(i).SetString(recordVal.(string))
			case uint64:
				modelElem.Field(i).SetUint(recordVal.(uint64))
			case time.Time:
				switch recordVal.(type) {
				case time.Time:
					break
				case string:
					recordVal, err = time.Parse(time.RFC3339, recordVal.(string))
					if err != nil {
						return err
					}
				}
				modelElem.Field(i).Set(reflect.ValueOf(recordVal.(time.Time)))
			}
		}

		if record[name] == nil {
			continue
		}

	}

	return nil
}
