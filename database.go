package main

import (
	"bytes"
	"errors"
	"fmt"
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
	// TODO: Make URL creation here better and remove hardcoding
	url := "http://" + db.URL.Host + "/links/link/9"
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

	link.ID = fmt.Sprintf("%d", rand.Intn(100)+10)
	links = append(links, link)
	return link, nil
}

func (db *DB) GetLink(ID string) (*Link, error) {
	// TODO: Read from elastic
	for i := range links {
		if links[i].ID == ID {
			return links[i], nil
		}
	}
	return nil, errors.New("Cannot find link by ID " + ID)
}
