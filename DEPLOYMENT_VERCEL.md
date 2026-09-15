# 🚀 Guide de Déploiement Vercel - AI Score Detector

## ✅ Corrections Appliquées

Toutes les erreurs 500 ont été corrigées en configurant les endpoints API pour utiliser **Neon PostgreSQL** au lieu de Supabase.

### Endpoints API Corrigés:
- `/api/stats` - Statistiques des analyses
- `/api/reports` - Liste des rapports
- `/api/analyses` - Historique des analyses
- `/api/institutional-databases` - Bases de données institutionnelles
- `/api/detect` - Détection IA avec Gemini
- `/api/extract` - Extraction de texte

---

## 🔧 Configuration Requise sur Vercel

### 1. Variables d'Environnement Obligatoires

Allez dans **Vercel Dashboard → Settings → Environment Variables** et ajoutez:

```bash
# Base de données Neon (OBLIGATOIRE)
DATABASE_URL="postgresql://neondb_owner:npg_hy1PFoWxjZ5V@ep-calm-frog-ayyfuhye-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
DIRECT_DATABASE_URL="postgresql://neondb_owner:npg_hy1PFoWxjZ5V@ep-calm-frog-ayyfuhye-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# Secret d'authentification (Générez une chaîne aléatoire)
AUTH_SECRET="votre_secret_aleatoire_long_de_32_caracteres_minimum"

# Clé API Gemini (Pour la détection IA)
GEMINI_API_KEY="votre_cle_gemini"
GEMINI_MODEL="gemini-2.0-flash-exp"
GEMINI_DETECTOR_MODEL="gemini-2.0-flash-exp"
```

### 2. Variables Optionnelles

```bash
# DeepSeek (Alternative à Gemini)
DEEPSEEK_API_KEY="votre_cle_deepseek"
DEEPSEEK_MODEL="deepseek-chat"
DEEPSEEK_BASE_URL="https://api.deepseek.com/v1"

# Copyleaks (Détection de plagiat)
COPYLEAKS_EMAIL="votre@email.com"
COPYLEAKS_API_KEY="votre_cle_copyleaks_prod"
COPYLEAKS_API_KEY_DEV="votre_cle_copyleaks_dev"

# Gmail SMTP (Envoi de rapports)
GMAIL_SMTP_USER="votre@gmail.com"
GMAIL_SMTP_APP_PASSWORD="votre_app_password"

# ZakaPro/MonCash (Paiements)
ZAKAPRO_API_URL="https://YOUR-ZAKAPRO-API-ENDPOINT"
ZAKAPRO_API_KEY="YOUR_ZAKAPRO_API_KEY"
ZAKAPRO_WEBHOOK_SECRET="YOUR_WEBHOOK_SECRET"
VITE_ZAKAPRO_APP_KEY="zk_pub_z471ugkkmt04kzwv4lgo"

# URL de l'application
APP_URL="https://votre-app.vercel.app"
```

---

## 📋 Étapes de Déploiement

### Méthode 1: Via GitHub (Recommandé)

1. **Pusher le code vers GitHub:**
   ```bash
   git add .
   git commit -m "Correction erreurs 500 - Migration vers Neon PostgreSQL"
   git push origin ai-score-error-c748a
   ```

2. **Connecter à Vercel:**
   - Allez sur [vercel.com](https://vercel.com)
   - Cliquez sur "Add New Project"
   - Importez votre repository GitHub
   - Sélectionnez la branche `ai-score-error-c748a` ou `main`

3. **Configurer les variables d'environnement:**
   - Dans "Environment Variables", ajoutez toutes les variables ci-dessus
   - Assurez-vous que `DATABASE_URL` est correcte

4. **Déployer:**
   - Cliquez sur "Deploy"
   - Attendez la fin du build (~2-3 minutes)

### Méthode 2: Via Vercel CLI

```bash
# Installer Vercel CLI
npm i -g vercel

# Se connecter
vercel login

# Déployer
vercel --prod
```

---

## 🗄️ Initialisation de la Base de Données

Exécutez ce SQL dans l'éditeur Neon pour créer les tables nécessaires:

```sql
-- Table des documents
CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  content TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table des analyses
CREATE TABLE IF NOT EXISTS analyses (
  id SERIAL PRIMARY KEY,
  document_id INTEGER REFERENCES documents(id),
  document_name VARCHAR(255),
  score DECIMAL(5,2),
  detected BOOLEAN DEFAULT FALSE,
  analysis_type VARCHAR(50),
  ai_feedback TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(document_id)
);

-- Table des bases de données institutionnelles
CREATE TABLE IF NOT EXISTS institutional_databases (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50),
  url TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  last_sync TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour performances
CREATE INDEX IF NOT EXISTS idx_anyses_created_at ON analyses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anyses_document_id ON analyses(document_id);
```

---

## ✅ Vérification Post-Déploiement

Après le déploiement, testez les endpoints:

```bash
# Remplacez https://votre-app.vercel.app par votre URL réelle

# Test stats
curl https://votre-app.vercel.app/api/stats

# Test reports
curl https://votre-app.vercel.app/api/reports

# Test analyses
curl https://votre-app.vercel.app/api/analyses?limit=10

# Test institutional databases
curl https://votre-app.vercel.app/api/institutional-databases
```

**Réponses attendues:** Status 200 avec des données JSON (pas d'erreur 500).

---

## 🐛 Dépannage

### Erreur 500 persistante
1. Vérifiez les logs Vercel: **Dashboard → Project → Logs**
2. Confirmez que `DATABASE_URL` est correcte dans les variables d'environnement
3. Testez la connexion Neon localement avec psql

### Erreur de connexion base de données
- Vérifiez que l'IP de Vercel est autorisée dans Neon
- Dans Neon Dashboard: **Settings → Connections → Allowed IPs**
- Ajoutez `0.0.0.0/0` pour tester (puis restreignez ensuite)

### Tables manquantes
- Exécutez le script SQL d'initialisation ci-dessus dans l'éditeur Neon
- Redéployez l'application

---

## 📝 Notes Importantes

- ⚠️ **Ne jamais committer** le fichier `.env` dans Git
- ✅ Utilisez toujours les variables d'environnement Vercel pour les secrets
- 🔒 La clé `SUPABASE_SERVICE_ROLE_KEY` n'est PAS nécessaire (vous utilisez Neon)
- 🔄 Les previews deployments utilisent les mêmes variables que production (ajustez si besoin)

---

## 🎯 Prochaines Étapes

1. ✅ Déployer sur Vercel
2. ✅ Ajouter les variables d'environnement
3. ✅ Initialiser la base de données Neon
4. ✅ Tester tous les endpoints API
5. ✅ Configurer un nom de domaine personnalisé (optionnel)

**Développé et signé par COJ (Cleef Oligens Joseph) — Tous droits réservés.**
