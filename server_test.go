package main

import (
	"github.com/stretchr/testify/assert"
	"net/http"
	"testing"
)

func TestLinkNotFound(t *testing.T) {
	resp, err := http.Get("http://localhost:3000/doesntexist")
	assert := assert.New(t)
	assert.Nil(err)
	assert.Equal(resp.StatusCode, 404)
}
