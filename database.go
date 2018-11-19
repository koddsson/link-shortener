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
	"time"
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

func (db *DB) AddLink(link *Link) (*Link, error) {
	if link.ID == "" {
		s := rand.New(rand.NewSource(time.Now().UnixNano()))
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

	// TODO: Make URL creation here better and remove hardcoding
	url := db.URL.Scheme + "://" + db.URL.Host + "/links/link/" + link.ID
	jsonbytes, err := json.Marshal(link)
	if err != nil {
		return nil, err
	}

	request, err := http.NewRequest("PUT", url, bytes.NewBuffer(jsonbytes))
	request.Header.Add("Content-Type", "application/json")
	request.Header.Add("Accept", "application/json")
	if err != nil {
		return nil, err
	}

	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}

	fmt.Println("About to parse body")

	var dbResponse map[string]string
	defer io.Copy(ioutil.Discard, response.Body)
	json.NewDecoder(response.Body).Decode(&dbResponse)

	if dbResponse["result"] != "updated" && dbResponse["result"] != "noop" {
		return nil, errors.New("Could not insert record got " + dbResponse["result"])
	}

	fmt.Printf("Body parsed, %#v (%v)\n", &dbResponse, dbResponse["result"])

	return link, nil
}

func (db *DB) GetLink(ID string) (*Link, error) {
	var link Link
	url := db.URL.Scheme + "://" + db.URL.Host + "/links/link/" + ID + "/_source"
	fmt.Printf("requesting from %v\n", url)
	response, err := client.Get(url)
	if err != nil {
		return nil, err
	}

	if response.StatusCode != http.StatusOK {
		return nil, errors.New("Link not found in database")
	}

	defer io.Copy(ioutil.Discard, response.Body)
	json.NewDecoder(response.Body).Decode(&link)

	link.ID = ID

	return &link, nil
}
