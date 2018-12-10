# link-shortener

It make the link shorter.

## Running

Install dependencies:

```sh
go get
```

Build the application

```sh
go build
```

Start the application:

Note that you need to have elasticsearch running

```sh
ES_URL=http://localhost:9200 ./link-shortener
```

## Developing

Run tests:

```sh
go test 
```

We use [`go-vcr`](https://github.com/dnaeon/go-vcr) to record HTTP requests as fixtures so if you add a new test, you'll need to spin up Elastic in order to record your request.

I'll put more info here later. This is kind of WIP right now.

