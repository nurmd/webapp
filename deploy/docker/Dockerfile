FROM nginx:alpine-slim

# Copy custom Nginx configuration
COPY deploy/nginx/vyapar-pwa.conf /etc/nginx/conf.d/default.conf

# Adjust server_name and port for container
RUN sed -i 's/billing.yourdomain.com/localhost/g' /etc/nginx/conf.d/default.conf && \
    sed -i 's/\/var\/www\/vyapar/\/usr\/share\/nginx\/html/g' /etc/nginx/conf.d/default.conf

# Copy production built PWA assets
COPY dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
