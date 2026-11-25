A web scraper used to fetch information from [SchedgeUp](https://www.schedgeup.com)

Expects the following env variables to be present in `process.env`(e.g by using [dotenv](https://www.npmjs.com/package/dotenv)):

- `SCHEDGEUP_EMAIL` : email for the user used to log into SchedgeUp
- `SCHEDGEUP_PASS` : password for the user used to log into SchedgeUp
- `THEATRE_ID` : To find your Theatre ID log into SchedgeUp and navigate to either Theatre Schedule or Calendar,
  ID will be in the URL (`https://www.schedgeup.com/theatres/====>59<====/events`)

Optionally, the env variable `NATIVE_COUNTRY_CODE` can be set for proper parsing of badly 
formatted phone numbers from the users page. (defaults to "NO" for Norway)
