package main

import (
	"time"
)

type Link struct {
	ID        string `json:"id" form:"id"`
	URL       string `json:"url" form:"url,omitempty"`
	Timestamp time.Time
}

func (l *Link) String() string {
	return l.URL
}

// NewLink creates a new link with a timestamp of the current time
func NewLink(URL string, ID string) *Link {
	return &Link{
		URL:       URL,
		ID:        ID,
		Timestamp: time.Now(),
	}
}
