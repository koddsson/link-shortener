#!/bin/bash

curl $1/links -v 2>&1 | grep '200 OK' > /dev/null

if [ $? -eq 1 ]; then
  curl $1/links -XPUT -d '{"settings": {"index": {"number_of_shards": 1}}}' -H 'Content-Type: application/json'
fi

curl $1/links/_mappings/link -XPUT -d '{"properties": {"@timestamp": {"type": "date"}, "url": {"type": "text", "analyzer": "standard"}}}' -H 'Content-Type: application/json'
