FROM python:3.12-slim
RUN pip install --no-cache-dir osmium==4.* shapely==2.*
WORKDIR /places
COPY categories.py extract_places.py london-boroughs.geojson ./
ENTRYPOINT ["python", "extract_places.py"]
