# ===========================================
#  🚀 DÉPLOIEMENT OHMGUARD SUR VPS AVEC DOCKER
# ===========================================

## Prérequis sur votre VPS

```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose git curl

# Démarrer Docker
sudo systemctl start docker
sudo systemctl enable docker

# Ajouter votre utilisateur au groupe docker (évite sudo)
sudo usermod -aG docker $USER
# Déconnectez-vous et reconnectez-vous pour appliquer
```

---

## 1️⃣ Cloner le projet

```bash
cd /opt
git clone <votre-repo> ohmguard
cd ohmguard
```

---

## 2️⃣ Configurer les variables d'environnement

```bash
# Copier le fichier exemple
cp .env.example .env

# Éditer avec vos valeurs
nano .env
```

**Variables importantes à modifier :**
```env
# Mot de passe MongoDB sécurisé
MONGO_PASSWORD=VotreMotDePasseSecurise123!

# Clé JWT unique (générez-en une avec: openssl rand -hex 32)
JWT_SECRET=votre-cle-jwt-generee

# URL publique de votre application
FRONTEND_URL=https://ohmguard.votredomaine.com

# Configuration MQTT (si vous avez des radars Vayyar)
MQTT_BROKER=votre-broker.com
MQTT_USERNAME=user
MQTT_PASSWORD=password
```

---

## 3️⃣ Construire et démarrer

```bash
# Construire les images
docker-compose build

# Démarrer en arrière-plan
docker-compose up -d

# Vérifier le statut
docker-compose ps

# Voir les logs
docker-compose logs -f
```

---

## 4️⃣ Vérifier le déploiement

```bash
# Tester le backend
curl http://localhost/api/health

# Tester le frontend
curl http://localhost
```

---

## 5️⃣ Configuration HTTPS avec Traefik (Recommandé)

Créez un fichier `docker-compose.prod.yml` :

```yaml
version: '3.8'

services:
  traefik:
    image: traefik:v2.10
    container_name: traefik
    restart: unless-stopped
    command:
      - "--api.dashboard=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
      - "--certificatesresolvers.letsencrypt.acme.email=votre@email.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - traefik_letsencrypt:/letsencrypt
    networks:
      - ohmguard-network

  frontend:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.ohmguard.rule=Host(`ohmguard.votredomaine.com`)"
      - "traefik.http.routers.ohmguard.entrypoints=websecure"
      - "traefik.http.routers.ohmguard.tls.certresolver=letsencrypt"
      - "traefik.http.routers.ohmguard-http.rule=Host(`ohmguard.votredomaine.com`)"
      - "traefik.http.routers.ohmguard-http.entrypoints=web"
      - "traefik.http.routers.ohmguard-http.middlewares=redirect-to-https"
      - "traefik.http.middlewares.redirect-to-https.redirectscheme.scheme=https"

volumes:
  traefik_letsencrypt:
```

Démarrer avec HTTPS :
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## 🔧 Commandes utiles

```bash
# Voir les logs d'un service
docker-compose logs -f backend
docker-compose logs -f frontend

# Redémarrer un service
docker-compose restart backend

# Arrêter tout
docker-compose down

# Arrêter et supprimer les volumes (⚠️ efface les données)
docker-compose down -v

# Reconstruire après modification du code
docker-compose build --no-cache
docker-compose up -d

# Accéder au shell d'un conteneur
docker-compose exec backend bash
docker-compose exec mongodb mongosh
```

---

## 🔒 Sécurité recommandée

1. **Firewall** :
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable
```

2. **Fail2ban** :
```bash
sudo apt install fail2ban
sudo systemctl enable fail2ban
```

3. **Mises à jour automatiques** :
```bash
sudo apt install unattended-upgrades
sudo dpkg-reconfigure unattended-upgrades
```

---

## 📊 Monitoring (Optionnel)

Ajoutez à `docker-compose.yml` :

```yaml
  portainer:
    image: portainer/portainer-ce
    container_name: portainer
    restart: unless-stopped
    ports:
      - "9000:9000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - portainer_data:/data

volumes:
  portainer_data:
```

Accès : `http://votre-ip:9000`

---

## 🆘 Dépannage

**Les conteneurs ne démarrent pas :**
```bash
docker-compose logs
```

**Problème de connexion MongoDB :**
```bash
docker-compose exec mongodb mongosh -u ohmguard -p
```

**Problème de build frontend :**
```bash
docker-compose build frontend --no-cache
```

**Vérifier l'espace disque :**
```bash
df -h
docker system prune -a  # Nettoyer les images inutilisées
```
