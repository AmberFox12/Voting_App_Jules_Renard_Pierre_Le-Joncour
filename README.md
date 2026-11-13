# Application de vote distribuée

Application web de vote composée de plusieurs services conteneurisés. Un utilisateur choisit une option sur l’interface de vote ; son vote est transmis à Redis, enregistré dans PostgreSQL par un worker, puis comptabilisé par le service de résultats.

L’application est orchestrée avec Docker Compose. Chaque composant s’exécute dans son propre conteneur et communique avec les autres sur des réseaux Docker dédiés.

## Fonctionnalités

- Présenter deux options de vote configurables.
- Enregistrer les votes sans attendre leur traitement en base de données.
- Mettre à jour le vote d’un même utilisateur.
- Stocker durablement les votes dans PostgreSQL.
- Diffuser les résultats au navigateur avec Socket.IO.
- Surveiller la disponibilité des services avec des healthchecks Docker.

## Architecture et flux d’un vote

```text
Navigateur
   │
   ├── vote :8080 ──> Redis :6379 ──> Worker ──> PostgreSQL :5432
   │                                             │
   └── result :8888 <────── résultats ──────────┘
```

1. **Vote** sert l’interface web et reçoit le choix de l’utilisateur.
2. **Redis** place le vote dans une liste servant de file d’attente.
3. **Worker** récupère les votes de la file et les écrit dans PostgreSQL.
4. **PostgreSQL** conserve un vote par identifiant de votant.
5. **Résultats** interroge PostgreSQL et diffuse les scores au navigateur.

### Rôle des services

| Service | Technologie | Rôle |
|---|---|---|
| `vote` | Python, Flask, Redis client | Afficher le formulaire et ajouter les votes à la file Redis. |
| `redis` | Redis | Mettre temporairement en attente les votes à traiter. |
| `worker` | .NET | Transférer les votes de Redis vers PostgreSQL. |
| `db` | PostgreSQL | Stocker les votes de manière persistante. |
| `result` | Node.js, Express, Socket.IO, `pg` | Lire les votes en base et diffuser les résultats. |

## Choix techniques

### Traitement asynchrone avec Redis

L’interface n’écrit pas directement dans PostgreSQL. Elle dépose le vote dans Redis, puis le worker le traite indépendamment. Cette file découple la réception des votes de leur enregistrement en base et permet au service de vote de répondre sans effectuer lui-même la requête SQL.

### PostgreSQL 

Redis sert de file de traitement ; PostgreSQL conserve les votes. Les données de PostgreSQL sont stockées dans un volume Docker nommé et survivent à l’arrêt des conteneurs.

### Services séparés

Chaque service a une responsabilité spécifique et son propre environnement d’exécution. Cela facilite le diagnostic et permet de reconstruire un service sans reconstruire toute l’application.

### Réseaux Docker

Compose crée trois réseaux :

- `front` relie les interfaces accessibles depuis l’hôte aux services applicatifs.
- `queue` relie Vote, Redis et Worker. Il est interne au réseau Docker.
- `data` relie Worker et Résultats à PostgreSQL. Il est également interne.

Redis et PostgreSQL ne publient pas de port sur l’hôte. Les autres conteneurs les contactent par leur nom de service (`redis` et `db`).

## Images Docker et construction

Les services applicatifs sont construits depuis les Dockerfiles du projet :

- `vote/Dockerfile` utilise l’image officielle `python:3.15.2-alpine3.24`.
- `result/Dockerfile` utilise `node:26.13.1-alpine3.24`, installe les dépendances verrouillées avec `npm ci` et exécute le service avec l’utilisateur non privilégié `node`.
- `worker/Dockerfile` utilise une construction multi-étapes :
  1. l’image Microsoft .NET SDK compile et publie le worker ;
  2. l’image Microsoft .NET Runtime exécute l’application publiée sans embarquer le SDK.

Redis et PostgreSQL utilisent des images officielles référencées dans `compose.yaml` :

- Redis : `redis:8.8.4-alpine3.23`
- PostgreSQL : `postgres:18.1-alpine3.23`

Les tags indiquent la version du logiciel et, lorsque le nom le précise, la version de la base Alpine. Alpine est choisi pour limiter la taille des images. Le worker .NET utilise les images Microsoft publiées sur Microsoft Container Registry (MCR), et non sur Docker Hub.

Les versions peuvent évoluer : les références exactes à utiliser sont celles présentes dans les Dockerfiles et dans `compose.yaml`. Un tag de version n’est pas une garantie d’identité immuable de l’image ; pour une reproductibilité stricte, il est possible d’épingler les images par digest (`sha256`), puis de mettre ces digests à jour de façon contrôlée.

## Conteneurs, ressources et santé

Docker Compose configure notamment :

- le démarrage des services dépendants après que Redis ou PostgreSQL est déclaré sain ;
- un redémarrage automatique avec `unless-stopped` ;
- des limites de mémoire et de CPU pour chaque conteneur ;
- des healthchecks pour Redis, PostgreSQL, Vote, Résultats et Worker.

Les routes HTTP de santé contrôlent aussi les dépendances principales :

- `GET /health` sur Vote vérifie Redis avec `PING`.
- `GET /health` sur Résultats exécute `SELECT 1` sur PostgreSQL.

Un état `healthy` signifie que le test associé au service réussit. Un healthcheck ne redémarre pas nécessairement un conteneur devenu malade : il permet avant tout à Docker et à l’utilisateur de constater son état. `depends_on` avec `service_healthy` contrôle l’ordre de démarrage, pas la disponibilité permanente des dépendances.

## Prérequis

- Docker Desktop ou Docker Engine avec Docker Compose v2.
- Git, si le projet est récupéré depuis un dépôt.

Vérifier l’installation :

```powershell
docker --version
docker compose version
```

## Configuration locale

Depuis la racine du dépôt, créer les fichiers locaux à partir des modèles :

```powershell
Copy-Item .env.example .env
Copy-Item secrets/db_password.txt.example secrets/db_password.txt
```

Le fichier `.env` contient les paramètres non secrets :

```dotenv
POSTGRES_DB=votes
POSTGRES_USER=postgres
OPTION_A=Cats
OPTION_B=Dogs
```

Remplacer le contenu de `secrets/db_password.txt` par un mot de passe local. Ce fichier est un secret : ne pas le publier ni l’ajouter à Git.

Compose transmet les paramètres de base et monte le fichier secret pour PostgreSQL, Worker et Résultats.

> PostgreSQL initialise l’utilisateur et la base lors de la première création de son volume. Si tu modifies les identifiants après cette initialisation, le volume existant conserve l’ancien état. Il faut alors gérer la migration ou recréer le volume, ce qui supprime les données.

## Lancer l’application

À la racine du projet :

```powershell
docker compose up --build -d
```

Cette commande construit les images locales manquantes ou modifiées, puis démarre les services en arrière-plan.

Afficher l’état des conteneurs :

```powershell
docker compose ps
```

Afficher les logs :

```powershell
docker compose logs -f
```

Pour un seul service :

```powershell
docker compose logs -f vote
docker compose logs -f worker
docker compose logs -f result
```

## Accès et vérifications

| Fonction | Adresse |
|---|---|
| Interface de vote | <http://localhost:8080> |
| Résultats | <http://localhost:8888> |
| Santé de Vote | <http://localhost:8080/health> |
| Santé de Résultats | <http://localhost:8888/health> |

Tester les routes de santé depuis PowerShell :

```powershell
curl.exe -i http://localhost:8080/health
curl.exe -i http://localhost:8888/health
```

Une réponse `200 OK` indique que le service et sa dépendance testée répondent. Une réponse `503 Service Unavailable` indique que la vérification de dépendance a échoué.

## Reconstruire ou redémarrer un service

Reconstruire et démarrer un service après une modification de code ou de Dockerfile :

```powershell
docker compose up --build -d <service>
```

Exemple :

```powershell
docker compose up --build -d vote
```

Pour forcer la recréation du worker :

```powershell
docker compose up --build -d --force-recreate worker
```

## Données persistantes et arrêt

Les données sont stockées dans des volumes nommés :

- `postgres_data` pour PostgreSQL ;
- `redis_data` pour Redis.

Arrêter et supprimer les conteneurs et réseaux sans supprimer les volumes :

```powershell
docker compose down
```

Supprimer aussi les volumes et donc les données persistantes :

```powershell
docker compose down -v
```

> Attention : `docker compose down -v` est destructif pour les données du projet.

## Dépannage

### Un service est `unhealthy`

Afficher les états et les logs :

```powershell
docker compose ps
docker compose logs --tail 100 <service>
```

Pour inspecter le résultat du healthcheck du worker :

```powershell
docker inspect --format '{{range .State.Health.Log}}{{.ExitCode}}: {{.Output}}{{end}}' voting-worker-1
```

Vérifier également la présence de `.env` et de `secrets/db_password.txt`, ainsi que la cohérence du mot de passe avec le volume PostgreSQL déjà initialisé.

## Structure du dépôt

```text
.
├── compose.yaml
├── vote/
│   ├── Dockerfile
│   ├── app.py
│   ├── requirements.txt
│   ├── templates/
│   └── static/
├── result/
│   ├── Dockerfile
│   ├── package.json
│   ├── package-lock.json
│   ├── server.js
│   └── views/
├── worker/
│   ├── Dockerfile
│   ├── Program.cs
│   └── Worker.csproj
├── secrets/
│   └── db_password.txt.example
└── run/
    └── scripts de lancement manuel
```

## Dépendances

- Python : versions de Flask et Redis client définies dans `vote/requirements.txt`.
- Node.js : versions exactes des dépendances verrouillées dans `result/package-lock.json`, installées par `npm ci`.
- .NET : framework cible et versions des packages définis dans `worker/Worker.csproj`.
- Redis et PostgreSQL : versions d’images définies dans `compose.yaml`.

Pour comprendre ou mettre à jour les versions réellement utilisées, consulter ces fichiers de configuration avant de modifier les tags.