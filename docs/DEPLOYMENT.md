# Oligens Detector — mise en production

## 1. Supabase / authentification e-mail

1. Créer un projet Supabase.
2. Dans **Authentication → URL Configuration**, ajouter l'URL Vercel de l'application comme Site URL et Redirect URL.
3. Dans **Authentication → SMTP Settings**, configurer Gmail SMTP avec un compte dédié.
   - Host: `smtp.gmail.com`
   - Port: `465` (SSL) ou `587` (STARTTLS)
   - Username: adresse Gmail dédiée
   - Password: **Google App Password de 16 caractères**, pas le mot de passe Gmail normal.
4. Activer la confirmation d'e-mail dans les paramètres Auth.
5. Exécuter `supabase/schema.sql` dans le SQL Editor.
6. Vérifier que le trigger crée une ligne Free pour chaque nouvel utilisateur.

Le mot de passe d'application Gmail et la clé `SUPABASE_SERVICE_ROLE_KEY` ne doivent jamais être commités ni préfixés par `VITE_`.

## 2. Vercel

Définir les variables de `.env.example` dans les paramètres du projet Vercel. Les variables `VITE_*` sont publiques côté navigateur; toutes les autres restent serveur.

Les fonctions `api/extract.ts`, `api/payments/create.ts` et `api/payments/webhook.ts` sont automatiquement exposées par Vercel.

## 3. Paiements Zakapro / MonCash / NatCash

Le dépôt fournit un adaptateur serveur indépendant du fournisseur. Le contrat exact de Zakapro doit être renseigné via `ZAKAPRO_API_URL` et `ZAKAPRO_API_KEY`; ne pas inventer un endpoint fournisseur.

Le flux est:

1. l'utilisateur choisit Flash, Pro ou Gold;
2. l'application calcule le prix HTG et la remise annuelle de 13%;
3. `/api/payments/create` valide la session, le plan, le numéro haïtien et le code promo;
4. une transaction `pending` est créée;
5. Zakapro/MonCash/NatCash confirme le paiement côté serveur;
6. `/api/payments/webhook` exige `x-zakapro-secret` et ne crédite l'abonnement qu'après statut payé;
7. Flash expire après 7 jours; Pro/Gold expirent à `current_period_end`.

Le prix À vie reste volontairement non activé tant qu'un prix commercial réel n'a pas été défini côté serveur.

## 4. Quotas

La fonction PostgreSQL `consume_analysis()` est l'autorité serveur:

- Free: maximum 2 500 mots/analyse;
- Flash: 1 analyse/jour et expiration automatique après 7 jours;
- Pro/Gold: pas de limite d'analyse définie par ce cahier des charges.

L'interface effectue également une vérification immédiate pour afficher un message avant lancement, mais la règle de sécurité est la fonction PostgreSQL.

## 5. Extraction documentaire

Le navigateur utilise PDF.js pour PDF et Mammoth pour DOCX. En cas d'échec, un fallback `/api/extract` tente l'extraction côté serveur. TXT/MD/RTF utilisent un décodage texte tolérant. Les anciens `.doc` binaires ne disposent pas d'un parser fiable déjà présent dans le projet; ils doivent être convertis en DOCX/PDF pour éviter une fausse extraction.

## 6. Vérification avant déploiement

```bash
npm install
npm run typecheck
npm run build
```

Tester au minimum: inscription → e-mail de confirmation → connexion → Free > 2 500 mots refusé → Flash 1 analyse/jour → paiement pending → webhook paid → abonnement actif → expiration.
