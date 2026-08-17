# Зависимостей у сервера нет, ставить нечего — образ это просто node и код.
FROM node:22-alpine

WORKDIR /app
COPY . .

# Аквариумы пишутся в /app/data — том монтируется снаружи, владелец должен
# совпадать с пользователем контейнера (uid 1000), иначе запись не пройдёт.
RUN mkdir -p data && chown -R node:node /app
USER node

ENV PORT=8000
EXPOSE 8000

# Healthcheck дёргает главную: сервер без зависимостей, падать ему негде,
# но перезапуск при зависшем процессе лишним не бывает.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8000/ >/dev/null || exit 1

CMD ["node", "server.js"]
