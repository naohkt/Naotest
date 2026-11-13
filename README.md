# 🍽️ Carte de fidélité avec QR code et notifications

Une web-app (PWA) pour restaurant : **pas besoin de l'App Store ni du Play Store**.

1. Le client **scanne le QR code** posé sur la table.
2. Il tape son prénom → il a **sa carte de fidélité** sur son téléphone (avec tampons).
3. Il active les **notifications** → il est prévenu quand il gagne une récompense, et reçoit vos offres.
4. En caisse, vous **scannez le QR de sa carte** (ou tapez son code à 6 lettres) → **+1 tampon**.

## Les pages

| Adresse | Pour qui | Rôle |
|---|---|---|
| `/` | Clients | Créer / voir sa carte, activer les notifications |
| `/admin` | Vous | Scanner les cartes, ajouter des tampons, donner les récompenses, envoyer des notifications, liste clients, réglages |
| `/affiche` | Vous | Affiche à imprimer avec le QR code du restaurant |

## Lancer en local

Il faut Node.js 22.13 ou plus récent.

```bash
npm install
ADMIN_PASSWORD=monmotdepasse npm start
```

Puis ouvrir http://localhost:3000 (client) et http://localhost:3000/admin (restaurant).

## Mettre en ligne (obligatoire pour les vrais clients)

Les notifications et la caméra **ne marchent qu'en HTTPS**. Hébergeurs simples : Render, Railway, Fly.io, un petit VPS…

Variables d'environnement :

| Variable | Exemple | Rôle |
|---|---|---|
| `ADMIN_PASSWORD` | `UnMotDePasseSolide` | **Obligatoire** — mot de passe de `/admin` |
| `PUBLIC_URL` | `https://fidelite.monresto.fr` | Adresse publique (utilisée pour le QR de l'affiche) |
| `RESTAURANT_NAME` | `Chez Paul` | Nom au premier lancement (modifiable ensuite dans Réglages) |
| `DATA_DIR` | `/data` | Dossier de la base de données — doit être un **disque persistant** |
| `VAPID_SUBJECT` | `mailto:contact@monresto.fr` | Contact technique pour les services de notification |

⚠️ Le dossier `data/` contient la base clients **et les clés de notification** (`vapid.json`). Si vous le perdez, les clients devront réactiver les notifications. Sauvegardez-le.

## Notifications : ce qu'il faut savoir

- **Android (Chrome, Samsung…)** : marche directement depuis le navigateur.
- **iPhone (iOS 16.4+)** : Apple impose d'**ajouter la carte à l'écran d'accueil** d'abord (Partager → « Sur l'écran d'accueil »). La page l'explique automatiquement aux utilisateurs d'iPhone.
- Notifications automatiques : à chaque tampon (« plus que X visites ») et quand une récompense est gagnée.
- Notifications manuelles : onglet **Notifier** de `/admin` (ex. « Ce soir, happy hour 🍹 »).

## Technique

Node.js + Express, base SQLite intégrée à Node (`node:sqlite`), notifications Web Push (`web-push`, clés VAPID générées automatiquement), QR codes (`qrcode`). Aucun service payant requis.
