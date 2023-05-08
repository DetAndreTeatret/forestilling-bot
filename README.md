Setting env variables
--------------------------
Values are encapsulated in `'`s (e.g. THEATRE_ID='23')

Email and password should be straight forward. 
To find Theatre ID log into SchedgeUp and navigate to either Theatre Schedule or Calendar,
ID will be in the URL (e.g `https://www.schedgeup.com/theatre/====>59<====/events`)

After you have set the values in `.env.dist` make sure to rename it to just `.env`

Compiling/Running
-------------------------

1. `npm install`
2. `tsc`
3. `node main.js`
4. Wait :)


Current behaviour is just a PoC, it will output all events for current month in console