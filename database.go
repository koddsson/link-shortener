package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"math/rand"
	"net/http"
	"net/url"
)

type DB struct {
	URL *url.URL
}

func NewDB(u string) (*DB, error) {
	url, err := url.Parse(u)
	if err != nil {
		return nil, err
	}
	return &DB{URL: url}, nil
}

var links = []*Link{}
var client = &http.Client{}

func (db *DB) NewLink(link *Link) (*Link, error) {
	if link.ID == "" {
		// Generate the ID
		var exists = true
		for exists {
			// Make ES call to the ID
			// Check if it exists
			link.ID = fmt.Sprintf("%d", rand.Intn(100)+10)
		}
	}

	// TODO: Make URL creation here better and remove hardcoding
	url := "http://" + db.URL.Host + "/links/link/" + link.ID
	// TODO: Do JSON marshalling better and remove hardcoding
	json := []byte(`{"url": "https://example.com"}`)

	request, err := http.NewRequest("PUT", url, bytes.NewBuffer(json))
	request.Header.Add("Content-Type", "application/json")
	request.Header.Add("Accept", "application/json")
	if err != nil {
		return nil, err
	}

	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}

	bodyBytes, err := ioutil.ReadAll(response.Body)
	body := string(bodyBytes[:])
	fmt.Printf("%+v", body)

	// TODO: Do something with response
	links = append(links, link)
	return link, nil
}

func (db *DB) GetLink(ID string) (*Link, error) {
	var link Link
	url := "http://" + db.URL.Host + "/links/link/" + ID + "/_source"
	response, err := client.Get(url)

	// TODO: Return error if status is not 200

	if err != nil {
		return nil, err
	}

	defer io.Copy(ioutil.Discard, response.Body)
	json.NewDecoder(response.Body).Decode(&link)

	link.ID = ID

	return &link, nil
}
