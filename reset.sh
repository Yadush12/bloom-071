#!/bin/bash
cd ~/bloom/backend && pkill -f "node index.js"
PGPASSWORD=bloom psql -h localhost -U bloom bloom -q -f schema.sql >/dev/null 2>&1
node seed.js && (nohup node index.js > server.log 2>&1 &)
sleep 2; echo "RESET OK: clean demo data"
(cd ~/bloom/backend && node seed_history.js)
(cd ~/bloom/backend && node seed_reviews.js)
