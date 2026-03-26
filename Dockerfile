FROM node:20-alpine
WORKDIR /app

# Install production deps first for better caching
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the source
COPY . .

ENV PORT=3000
ENV WORKBOOKS_DIR=/app/workbooks

RUN mkdir -p /app/workbooks /app/data
VOLUME ["/app/workbooks", "/app/data"]
EXPOSE 3000

CMD ["npm", "start"]
