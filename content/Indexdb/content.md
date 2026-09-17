# INFLUXDB CLI

# CONFIG
influx ping
influx config
influx config ls
influx config create --config-name NAME --host-url URL --org ORG --token TOKEN --active

# ORG
influx org list
influx org create --name ORG
influx org find --name ORG
influx org delete --name ORG

# BUCKET
influx bucket list
influx bucket create --name BUCKET --org ORG
influx bucket find --name BUCKET
influx bucket delete --name BUCKET --org ORG

# TOKEN
influx auth list
influx auth create --all-access
influx auth create --org ORG --read-buckets --write-buckets
influx auth delete --id ID

# QUERY
influx query 'from(bucket:"BUCKET") |> range(start:-1h)'
influx query --file query.flux

# WRITE
influx write --bucket BUCKET --org ORG 'temperature,room=kitchen value=23.5'
influx write --bucket BUCKET --org ORG --file data.lp

# FLUX
from(bucket:"BUCKET") |> range(start:-24h)
|> filter(fn:(r)=>r._measurement=="temperature")
|> filter(fn:(r)=>r._field=="value")
|> filter(fn:(r)=>r.room=="kitchen")
|> last()                         # ultimo
|> first()                        # primo
|> mean()                         # media
|> min()                          # minimo
|> max()                          # massimo
|> sum()                          # somma
|> count()                        # conteggio
|> aggregateWindow(every:5m,fn:mean)

# SCHEMA
import "influxdata/influxdb/schema"
schema.measurements(bucket:"BUCKET")
schema.fieldKeys(bucket:"BUCKET")
schema.tagKeys(bucket:"BUCKET")
schema.tagValues(bucket:"BUCKET",tag:"room")

# LINE PROTOCOL
measurement,tag=value field=23.5
measurement,tag=a,type=b field=23.5
measurement,tag=a value=23i
measurement,tag=a value=true
measurement,tag=a value="text"

# DOCKER
docker run -d --name influxdb -p 8086:8086 influxdb:2
docker ps
docker logs influxdb
docker exec -it influxdb bash
docker stop/start/restart influxdb
docker rm influxdb

# API
curl http://localhost:8086/health
curl http://localhost:8086/api/v2