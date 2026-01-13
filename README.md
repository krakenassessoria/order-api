# Orders Analytics API

Serviço leve para analytics de clientes usando MongoDB e dados pré-aggregados.

## Requisitos
- Node 22+
- Docker + Docker Compose
- Acesso ao MongoDB principal

## Variáveis de ambiente
- `MONGODB_URI` : string de conexão do Mongo
- `ANALYTICS_JOB_TOKEN` : token para proteger o rebuild
- `CORS_ORIGIN` : origem permitida (ex.: `https://espelho.vercel.app`)
- `PORT` : porta do serviço (padrão `4001`)

## Subir com Docker
```bash
docker compose -f docker-compose.analytics.yml up -d --build
```

## Primeira carga (manual)
```bash
curl "https://orders.carademau.app/analytics/rebuild?token=SEU_TOKEN"
```

## Endpoints
- `GET /clientes/analytics` - painel de analytics (aceita os mesmos filtros do frontend)
- `GET /analytics/rebuild` - rebuild da coleção `analyticsOrders`

## Notas
- O serviço escreve na coleção `analyticsOrders`.
- O painel deve apontar para `NEXT_PUBLIC_ANALYTICS_API_BASE=https://orders.carademau.app`.
