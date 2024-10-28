(async function() {
        while (!Spicetify.React || !Spicetify.ReactDOM) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        var songDviews = (() => {
  // src/app.tsx
  var { fetchPlaylistMetadata, getAlbum, queryAlbumTracks, QueryDefinitions } = Spicetify.GraphQL.Definitions;
  var CACHE_INVALIDATION_TIME_SECONDS = 24 * 60 * 60 * 7;
  var playCountCache = {};
  async function storePlaycountCache(playcountCache) {
    Spicetify.LocalStorage.set("playcountCache", JSON.stringify(playcountCache));
  }
  async function loadPlaycountCache() {
    let cache = await Spicetify.LocalStorage.get("playcountCache");
    if (cache) {
      console.log("Loaded playcount cache");
      return JSON.parse(cache);
    }
    console.log("No playcount cache found");
    return {};
  }
  async function getPlaylistPlaycounts(playlistId, useCache = true) {
    let fetchPlaylist = {
      "name": "fetchPlaylist",
      "operation": "query",
      "sha256Hash": "76849d094f1ac9870ac9dbd5731bde5dc228264574b5f5d8cbc8f5a8f2f26116",
      "value": null
    };
    if (useCache && playlistId in playCountCache) {
      if (playCountCache[playlistId]["cacheTimestamp"] > Date.now() / 1e3 - CACHE_INVALIDATION_TIME_SECONDS) {
        console.log("Using cached playcounts for playlist", playlistId);
        return playCountCache[playlistId]["playcounts"];
      }
      console.log("Cache expired for playlist", playlistId);
    }
    while (!Spicetify.GraphQL.Request) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const FETCH_LIMIT = 100;
    let response = await Spicetify.GraphQL.Request(
      fetchPlaylist,
      { uri: "spotify:playlist:" + playlistId, limit: FETCH_LIMIT, offset: 0 }
    );
    const totalCount = response["data"]["playlistV2"]["content"]["totalCount"];
    let currentCount = 0;
    let playcountMapper = {};
    while (currentCount < totalCount) {
      let response2 = await Spicetify.GraphQL.Request(
        fetchPlaylist,
        { uri: "spotify:playlist:" + playlistId, limit: FETCH_LIMIT, offset: currentCount }
      );
      for (let track of response2["data"]["playlistV2"]["content"]["items"]) {
        let itemName = track["itemV2"]["data"]["name"];
        let itemPlaycount = track["itemV2"]["data"]["playcount"];
        playcountMapper[itemName] = Number(itemPlaycount).toLocaleString();
      }
      currentCount += FETCH_LIMIT;
    }
    playCountCache[playlistId] = {
      cacheTimestamp: Date.now() / 1e3,
      playcounts: playcountMapper
    };
    storePlaycountCache(playCountCache);
    return playcountMapper;
  }
  async function main() {
    while (!Spicetify?.showNotification) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    playCountCache = await loadPlaycountCache();
    const observer = new MutationObserver(async () => {
      observer.disconnect();
      await addTrackListViews();
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    });
    await addTrackListViews();
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  function getPageType() {
    const pathname = Spicetify.Platform.History.location.pathname;
    if (pathname.includes("album")) {
      return "album" /* Album */;
    }
    if (pathname.includes("artist")) {
      return "artist" /* Artist */;
    }
    if (pathname.includes("playlist")) {
      return "playlist" /* Playlist */;
    }
    if (pathname.includes("search")) {
      return "search" /* Search */;
    }
    return "home" /* Home */;
  }
  function createPlayCountColumn(playCount = "N/A") {
    let playCountColumn = document.createElement("div");
    playCountColumn.role = "gridcell";
    playCountColumn.style.display = "flex";
    playCountColumn.classList.add("main-trackList-rowSectionVariable");
    playCountColumn.classList.add("tracklist-views-column");
    const span = document.createElement("span");
    span.classList.add("encore-text", "encore-text-body-small", "encore-internal-color-text-subdued");
    span.innerHTML = playCount;
    playCountColumn.appendChild(span);
    return playCountColumn;
  }
  async function addTrackListViews() {
    if (getPageType() !== "playlist" /* Playlist */) {
      return;
    }
    let currentPlaylist = Spicetify.Platform.History.location.pathname.split("/")[2];
    let playcounts = await getPlaylistPlaycounts(currentPlaylist);
    const tracklistColumnsCss = [
      null,
      null,
      null,
      null,
      "[index] 16px [first] 4fr [var1] 2fr [var2] 1fr [last] minmax(120px,1fr)",
      "[index] 16px [first] 6fr [var1] 4fr [var2] 3fr [var3] 2fr [last] minmax(120px,1fr)",
      "[index] 16px [first] 6fr [var1] 4fr [var2] 3fr [var3] minmax(120px,2fr) [var3] 2fr [last] minmax(120px,1fr)"
    ];
    const tracklistHeaders = document.querySelectorAll(".main-trackList-trackListHeaderRow");
    tracklistHeaders.forEach((header) => {
      let lastColumn = header.querySelector(".main-trackList-rowSectionEnd");
      let colIndexInt = parseInt(lastColumn.getAttribute("aria-colindex"));
      if (tracklistColumnsCss[colIndexInt]) {
        header.style["grid-template-columns"] = tracklistColumnsCss[colIndexInt];
      }
      let playsHeaderColumn = document.createElement("div");
      playsHeaderColumn.classList.add("main-trackList-rowSectionStart", "plays-label-column");
      playsHeaderColumn.role = "columnheader";
      playsHeaderColumn.tabIndex = -1;
      let sortButton = document.createElement("button");
      sortButton.classList.add("main-trackList-column", "main-trackList-sortable");
      sortButton.tabIndex = -1;
      let playsSpan = document.createElement("span");
      playsSpan.classList.add("encore-text", "encore-text-body-small", "standalone-ellipsis-one-line");
      playsSpan.setAttribute("data-encore-id", "text");
      playsSpan.innerText = "Plays";
      sortButton.appendChild(playsSpan);
      playsHeaderColumn.appendChild(sortButton);
      if (document.querySelector(".plays-label-column") === null) {
        let headerRow = document.querySelector(".main-trackList-trackListHeaderRow");
        if (headerRow) {
          headerRow.insertBefore(playsHeaderColumn, lastColumn);
        }
      }
    });
    let reloadedCache = false;
    let visibleTrackList = document.querySelectorAll("div.main-trackList-indexable > div.main-rootlist-wrapper > div[role='presentation'] > div[role='row']");
    visibleTrackList.forEach(async (track) => {
      let trackName = track.querySelector("div.main-trackList-rowTitle");
      let rowElement = track.querySelector("div.main-trackList-trackListRowGrid");
      if (rowElement && rowElement.querySelector(".tracklist-views-column") === null) {
        let itemPlaycount = playcounts[trackName.innerText];
        if (!reloadedCache && !itemPlaycount) {
          console.log("Reloading cache for playlist", currentPlaylist);
          playcounts = await getPlaylistPlaycounts(currentPlaylist, false);
          itemPlaycount = playcounts[trackName.innerText];
          reloadedCache = true;
        }
        let lastColumn = track.querySelector(".main-trackList-rowSectionEnd");
        let colIndexInt = parseInt(lastColumn.getAttribute("aria-colindex"));
        let playCountsColumn = track.querySelector(".tracklist-views-column");
        if (playCountsColumn) {
          let span = playCountsColumn.querySelector("span");
          console.log("span", span);
          span.innerHTML = itemPlaycount ?? "N/A";
        } else {
          playCountsColumn = createPlayCountColumn(itemPlaycount ?? "N/A");
          playCountsColumn.setAttribute("aria-colindex", 5 .toString());
          lastColumn.setAttribute("aria-colindex", 6 .toString());
        }
        rowElement.insertBefore(playCountsColumn, lastColumn);
        if (tracklistColumnsCss[colIndexInt])
          rowElement.style["grid-template-columns"] = tracklistColumnsCss[colIndexInt];
      }
    });
  }
  var app_default = main;

  // C:/Users/Chazm/AppData/Local/Temp/spicetify-creator/index.jsx
  (async () => {
    await app_default();
  })();
})();

      })();