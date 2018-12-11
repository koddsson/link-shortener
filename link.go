package main

type Link struct {
	ID  string `json:"id" form:"id"`
	URL string `json:"url" form:"url,omitempty"`
}

func (l *Link) String() string {
	return l.URL
}
