forestilling-bot
--------------------------
Discord bot brukt av Det Andre Teatret for å automatisk lage kanaler for forestillingskvelder basert på lister
fra SchedgeUp for bemanning.


Setting env variables
--------------------------
Values are encapsulated in `'`s (e.g. THEATRE_ID='23')

To find Theatre ID log into SchedgeUp and navigate to either Theatre Schedule or Calendar,
ID will be in the URL (e.g `https://www.schedgeup.com/theatres/====>59<====/events`)

Set up the necessary Discord stuff through their developer portal.

After you have set the values in `.env.dist` make sure to rename it to just `.env`

Compiling/Running
-------------------------

1. `npm install`
2. `npm run start`
3. Wait and follow instructions in terminal :)
