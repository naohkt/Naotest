# Smile Bar — Kamala Beach, Phuket

Redesign of smilebarphuket.com: a static site (HTML/CSS/JS, no build step).

- `index.html` — the page
- `assets/css/style.css` — styles
- `assets/js/menu.js` — full menu with prices, transcribed from the official menu (edit here to update dishes/prices)
- `assets/js/i18n.js` — English / French texts
- `assets/js/app.js` — interactions and the booking flow
- `assets/img/` — photos from the restaurant's site and menu

## Booking

Guests pick guests, date, time and seating, then their details. By default the
request is sent to the restaurant on WhatsApp (+66 89 677 4851) with all details
prefilled, and the guest can add it to their calendar. To receive bookings
directly (email, spreadsheet, your own API), set `bookingEndpoint` in
`assets/js/app.js` to a URL that accepts a JSON POST.

## Run locally

    python3 -m http.server 8000
