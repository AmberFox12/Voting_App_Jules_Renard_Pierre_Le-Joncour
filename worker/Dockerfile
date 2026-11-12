# Étape 1 : build, avec le SDK
FROM mcr.microsoft.com/dotnet/sdk:11.0-alpine3.24 AS build
WORKDIR /app
COPY . .
RUN dotnet publish -c Release -o /app

# Étape 2 : exécution, avec le runtime seul
FROM mcr.microsoft.com/dotnet/runtime:11.0-alpine3.24
WORKDIR /app
COPY --from=build /app .
USER app
ENTRYPOINT ["dotnet", "Worker.dll"]
