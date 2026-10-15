# mijn-eerste-project

Een routeplanner in de stijl van Strava: klik punten aan op de kaart, de route volgt automatisch wegen en paden en je ziet meteen de afstand, de hoogtemeters en het hoogteprofiel. Daarna download je de route als GPX of open je hem in Google Maps.

## Functies

- **Kaart** met vijf lagen: gewone kaart, OpenStreetMap, fietskaart, terrein en satelliet
- **Klikken = punt toevoegen**: de punten worden automatisch verbonden via wegen en paden
- **Sport kiezen**: fiets, racefiets, MTB, wandelen, hardlopen of rechte lijn
- **Afstand, stijgen, dalen en geschatte tijd** worden live berekend
- **Hoogteprofiel**: beweeg erover om het punt op de kaart te zien
- **Lus maken**: klik op het startpunt om de route terug naar de start te laten lopen
- **Bewerken**: punten verslepen, op de route klikken om een tussenpunt toe te voegen, op een punt klikken om het te verwijderen, ongedaan maken (Ctrl+Z), omdraaien, terug naar start
- **Exporteren**: GPX downloaden (met hoogtes, werkt met Garmin, Wahoo, Strava, Komoot, …) of openen in Google Maps
- **GPX importeren** om een bestaande route te bekijken of aan te passen
- **Live locatie**: blauwe stip die je volgt terwijl je beweegt (werkt via GitHub Pages of `localhost`)
- **Snelknoppen op de kaart**: ongedaan maken, lus sluiten en wissen zonder het menu te openen
- **Plaats zoeken**
- De route wordt automatisch bewaard in je browser

## Gebruiken

Je hebt geen installatie of API-sleutel nodig.

**Windows:** dubbelklik op **`Start Routeplanner.bat`**. Er opent een venster (laat dat open) en de app verschijnt in je browser. Toont Windows een blauwe waarschuwing, kies dan *Meer informatie → Toch uitvoeren*.

Je kunt ook gewoon `index.html` openen, maar dan weigert OpenStreetMap zijn kaart en krijg je een kaart van Esri zonder kleine paadjes.

**Mac/Linux:** start een klein webservertje in deze map:

```bash
python3 -m http.server 8000
```

en ga naar <http://localhost:8000>.

### Op je gsm (via GitHub Pages)

GitHub Pages is gratis voor **publieke** repositories.

1. Zet de repository publiek: **Settings → General → Danger Zone → Change visibility → Public**.
2. Ga naar **Settings → Pages**, kies bij *Source* "Deploy from a branch", kies de branch met de app en de map `/ (root)` en klik op **Save**.
3. Na een minuutje staat je app op `https://<gebruikersnaam>.github.io/mijn-eerste-project/`.
4. Open die link op je gsm en kies **Zet op beginscherm** (iPhone: deel-knop in Safari; Android: menu ⋮ in Chrome). Je krijgt dan een app-icoon en de app opent schermvullend.

Op de gsm is het menu standaard ingeklapt zodat de kaart groot is. Tik op de oranje balk onderaan om het open te klappen.

## Hoe het werkt

| Bestand | Wat het doet |
| --- | --- |
| `index.html` | De pagina-opbouw |
| `css/style.css` | De vormgeving (ook voor gsm) |
| `js/app.js` | Kaart, klikken, slepen, statistieken en export |
| `js/routing.js` | Routes berekenen per sport |
| `js/elevation.js` | Het hoogteprofiel |
| `js/geo.js` | Rekenwerk: afstanden, hoogtemeters, GPX en de Google Maps-link |

Gebruikte gratis diensten:

- [Leaflet](https://leafletjs.com) (meegeleverd in `vendor/leaflet`) met kaarten van [OpenStreetMap](https://www.openstreetmap.org), [CyclOSM](https://www.cyclosm.org) en Esri
- [BRouter](https://brouter.de) voor de routes (inclusief hoogtes)
- [Open-Meteo](https://open-meteo.com) voor hoogtes in de modus "rechte lijn"
- [Nominatim](https://nominatim.org) om plaatsen te zoeken

Hoogtemeters worden berekend met een drempel van 4 m, zodat kleine schommelingen in de hoogtedata niet meetellen. Daardoor kan het resultaat licht verschillen van Strava of Komoot.

Google Maps aanvaardt in een link maximaal 11 punten (start, einde en 9 tussenpunten). De app kiest daarom 11 punten op gelijke afstand langs de berekende route, zodat Google die zo goed mogelijk volgt. Tussen die punten kiest Google zelf de weg, dus kleine afwijkingen blijven mogelijk; voor navigatie gebruik je best het GPX-bestand. In de app zelf en in het GPX-bestand is er geen limiet.
