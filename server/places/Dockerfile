FROM python:3.12-slim
# osmium's wheel links against these system libraries; newer slim images
# leave libexpat out, which breaks "import osmium".
RUN apt-get update \
 && apt-get install -y --no-install-recommends libexpat1 libbz2-1.0 zlib1g liblz4-1 \
 && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir osmium==4.* shapely==2.*
WORKDIR /places
COPY categories.py extract_places.py extract_roads.py extract_entrances.py practical_speeds.py london-boroughs.geojson ./
# Fail the build here, not 10 minutes into a map build, if osmium can't load.
RUN python -c "import osmium, shapely"
ENTRYPOINT ["python", "extract_places.py"]
