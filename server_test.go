package main

import (
	"bytes"
	"github.com/stretchr/testify/require"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

var client = &http.Client{
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	},
}

func TestLinkGetNotFound(t *testing.T) {
	require := require.New(t)
	r := CreateServer()
	server := httptest.NewServer(r)
	defer server.Close()

	resp, err := client.Get(server.URL + "/doesntexist")
	require.NoError(err)
	require.Equal(404, resp.StatusCode)
}

func TestLinkGetFound(t *testing.T) {
	// TODO: Insert the link to database
	require := require.New(t)
	r := CreateServer()
	server := httptest.NewServer(r)
	defer server.Close()

	resp, err := client.Get(server.URL + "/exists")
	require.NoError(err)
	require.Equal(302, resp.StatusCode)

	// TODO: Test headers and response body
}

// Post scenarios
// 	1. URL doesn't exits in DB and ID not provided.
// 	2. ID & URL doesn't exist in DB.
// 	3. ID doesn't exits in DB but URL does.
// 	4. URL doesn't exits in DB but ID does.
// 	5. URL does exits in DB and ID not provided.
// 	6. URL and ID not provided.
// 	7. URL not provided.

func TestLinkPostJSON(t *testing.T) {
	require := require.New(t)
	r := CreateServer()
	server := httptest.NewServer(r)
	defer server.Close()
	json := []byte(`{"url": "https://example.com"}`)

	resp, err := http.Post(server.URL+"/new-link", "application/json", bytes.NewBuffer(json))
	require.NoError(err)
	require.Equal(201, resp.StatusCode)

	// TODO: Test headers and response body
}

func TestLinkPostFormData(t *testing.T) {
	require := require.New(t)
	r := CreateServer()
	server := httptest.NewServer(r)
	defer server.Close()
	json := []byte(`{"url": "https://example.com"}`)

	resp, err := http.Post(server.URL+"/new-link", "application/json", bytes.NewBuffer(json))
	require.NoError(err)
	require.Equal(201, resp.StatusCode)

	// TODO: Test headers and response body
}

func TestLinkPostJSONURLNotProvided(t *testing.T) {
	require := require.New(t)
	r := CreateServer()
	server := httptest.NewServer(r)
	defer server.Close()

	resp, err := http.PostForm(server.URL+"/new-link", url.Values{"url": {"https://example.com"}})
	require.NoError(err)
	require.Equal(400, resp.StatusCode)
}

func TestLinkPostFormDataURLNotProvided(t *testing.T) {
	require := require.New(t)
	r := CreateServer()
	server := httptest.NewServer(r)
	defer server.Close()

	resp, err := http.PostForm(server.URL+"/new-link", url.Values{})
	require.NoError(err)
	require.Equal(400, resp.StatusCode)
}

func TestLinkPostJSONURLAndIDNotProvided(t *testing.T) {
	require := require.New(t)
	r := CreateServer()
	server := httptest.NewServer(r)
	defer server.Close()
	json := []byte(`{}`)

	resp, err := http.Post(server.URL, "application/json", bytes.NewBuffer(json))
	require.NoError(err)
	require.Equal(400, resp.StatusCode)
}

func TestLinkPostFormDataURLAndIDNotProvided(t *testing.T) {
	require := require.New(t)
	r := CreateServer()
	server := httptest.NewServer(r)
	defer server.Close()

	resp, err := http.PostForm(server.URL, url.Values{})
	require.NoError(err)
	require.Equal(400, resp.StatusCode)
}
