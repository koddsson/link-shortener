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
ES_URL=http://localhost:9200 go test 
```

I'll put more info here later. This is kind of WIP right now.

