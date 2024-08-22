const { fetchPlaylistMetadata, getAlbum, queryAlbumTracks, QueryDefinitions } = Spicetify.GraphQL.Definitions;
import express from 'express';
import cors from 'cors';

const CACHE_INVALIDATION_TIME_SECONDS = 24 * 60 * 60; // 1 day

let playCountCache: PlayCountCache = {}

let mainObserver = null
let mainElement = null
let oldMainElement = null

type PlayCountCache = {
  [key: string]: PlayCountCacheEntry
}

type PlayCountCacheEntry = {
  cacheTimestamp: number,
  playcounts: Record<string, string>
}

enum PageType {
  Album = "album",
  Artist = "artist",
  Playlist = "playlist",
  Search = "search",
  Home = "home",
}

// async function UpdatePlaycountCache() {
//   let playlists = await Spicetify.CosmosAsync.get("sp://core-playlist/v1/rootlist");
//   let playlistsData = playlists['rows'];
//   let playlistIds = playlistsData.map((playlist: any) => playlist['uri'].split(":")[2])
//   console.log("playlistIds", playlistIds)
//   for (let playlistId of playlistIds) {
//     await getPlaylistPlaycounts(playlistId)
//   }
  
//   return playlists;
// }

async function storePlaycountCache(playcountCache: PlayCountCache) {  // Store playcount cache serialized in local storage so it persists between sessions
  Spicetify.LocalStorage.set("playcountCache", JSON.stringify(playcountCache))
}

async function loadPlaycountCache() {
  let cache = await Spicetify.LocalStorage.get("playcountCache")
  if (cache) {
    return JSON.parse(cache)
  }
  return {}
}

async function clearPlaycountCache() {
  Spicetify.LocalStorage.remove("playcountCache")
}

async function getPlaylistPlaycounts(playlistId: string) {
  let fetchPlaylist = {
    'name': 'fetchPlaylist',
    'operation': 'query',
    'sha256Hash': '76849d094f1ac9870ac9dbd5731bde5dc228264574b5f5d8cbc8f5a8f2f26116',
    'value': null
    // 'extensions': { 'version': 1, 'sha256Hash': '76849d094f1ac9870ac9dbd5731bde5dc228264574b5f5d8cbc8f5a8f2f26116' }
  }
  if (playlistId in playCountCache && playCountCache[playlistId]['cacheTimestamp'] > Date.now()/1000.0 - CACHE_INVALIDATION_TIME_SECONDS) { // Cache is valid, so return playlist playcounts
    return playCountCache[playlistId]['playcounts']
  }

  while (!Spicetify.GraphQL.Request) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const FETCH_LIMIT = 100
  let response = await Spicetify.GraphQL.Request(
    fetchPlaylist,
    { uri: 'spotify:playlist:' + playlistId, limit: FETCH_LIMIT, offset: 0 },
  );
  const totalCount = response['data']['playlistV2']['content']['totalCount']
  let currentCount = 0

  let playcountMapper: Record<string, string> = {}
  while (currentCount < totalCount) { // Pagination to fetch all tracks in the playlist
    let response = await Spicetify.GraphQL.Request(
      fetchPlaylist,
      { uri: 'spotify:playlist:' + playlistId, limit: FETCH_LIMIT, offset: currentCount },
    );
    for (let track of response["data"]["playlistV2"]["content"]["items"]) { // Iterate through each track in the playlist
      let itemName = track['itemV2']['data']['name']
      let itemPlaycount = track['itemV2']['data']['playcount']
      playcountMapper[itemName] = Number(itemPlaycount).toLocaleString()  // Map track name to playcount and add commas
    }
    currentCount += FETCH_LIMIT
  }

  playCountCache[playlistId] = {  // Update cache
    cacheTimestamp: Date.now()/1000.0,  // Store current timestamp in seconds for cache invalidation
    playcounts: playcountMapper
  }

  storePlaycountCache(playCountCache)  // Store new cache in local storage
  return playcountMapper
}

async function main() {
  while (!Spicetify?.showNotification) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  playCountCache = await loadPlaycountCache()

  const observer = new MutationObserver(async () => {   // Observe changes in the DOM to add playcount columns to the tracklist whenever scrolling or changing pages
    observer.disconnect();  // Disconnect observer to allow for changes to the DOM without triggering the observer
    await addTrackListViews()

    observer.observe(document.body, { // Reconnect observer to observe changes in the DOM
        childList: true,
        subtree: true,
    });
  });

  await addTrackListViews();  // Add playcount columns to the tracklist initially on page load
  observer.observe(document.body, {
      childList: true,
      subtree: true,
  });
}

function getPageType(): PageType {
  const pathname = Spicetify.Platform.History.location.pathname;
  if (pathname.includes("album")) {
    return PageType.Album;
  }
  if (pathname.includes("artist")) {
    return PageType.Artist;
  }
  if (pathname.includes("playlist")) {
    return PageType.Playlist;
  }
  if (pathname.includes("search")) {
    return PageType.Search;
  }
  return PageType.Home
}

function createPlayCountColumn(playCount: string = "N/A") {   // Create playcount column for each track in the tracklist
  let playCountColumn = document.createElement("div");
  playCountColumn.role = "gridcell";
  playCountColumn.style.display = "flex";
  playCountColumn.classList.add("main-trackList-rowSectionVariable");
  playCountColumn.classList.add("tracklist-views-column");  // Custom class to identify playcount columns
  
  const span = document.createElement('span')
  span.classList.add('encore-text', 'encore-text-body-small', 'encore-internal-color-text-subdued')
  span.innerHTML = playCount

  playCountColumn.appendChild(span);
  return playCountColumn;
}

async function addTrackListViews() {
  if (getPageType() !== PageType.Playlist) {
    return;
  }
  let currentPlaylist = Spicetify.Platform.History.location.pathname.split("/")[2]    // Get the playlist ID from the URL
  let playcounts = await getPlaylistPlaycounts(currentPlaylist)

  const tracklistColumnsCss = [   // CSS grid template columns for each tracklist column configuration
      null,
      null, 
      null,
      null,
      "[index] 16px [first] 4fr [var1] 2fr [var2] 1fr [last] minmax(120px,1fr)",
      "[index] 16px [first] 6fr [var1] 4fr [var2] 3fr [var3] 2fr [last] minmax(120px,1fr)",
      "[index] 16px [first] 6fr [var1] 4fr [var2] 3fr [var3] minmax(120px,2fr) [var3] 2fr [last] minmax(120px,1fr)",
  ];
  
  const tracklistHeaders = document.querySelectorAll(".main-trackList-trackListHeaderRow"); // Tracklist headers (e.g. "Title", "Album", etc.)
  tracklistHeaders.forEach((header) => {
    let lastColumn = header.querySelector(".main-trackList-rowSectionEnd");
    let colIndexInt = parseInt(lastColumn.getAttribute("aria-colindex")); // No clue what this does but it works, copied it from another extension
    if (tracklistColumnsCss[colIndexInt]) {
      header.style["grid-template-columns"] = tracklistColumnsCss[colIndexInt];
    }
    let playsHeaderColumn = document.createElement("div");  // Create playcount column header with same hierarchy as other columns
    playsHeaderColumn.classList.add('main-trackList-rowSectionStart', 'plays-label-column');
    playsHeaderColumn.role = 'columnheader';
    playsHeaderColumn.tabIndex = -1;
    
    let sortButton = document.createElement('button');
    sortButton.classList.add('main-trackList-column', 'main-trackList-sortable');
    sortButton.tabIndex = -1;
    
    let playsSpan = document.createElement('span');
    playsSpan.classList.add('encore-text', 'encore-text-body-small', 'standalone-ellipsis-one-line');
    playsSpan.setAttribute('data-encore-id', 'text');
    playsSpan.innerText = 'Plays';
    
    sortButton.appendChild(playsSpan);
    playsHeaderColumn.appendChild(sortButton);

    if (document.querySelector('.plays-label-column') === null) {   // Make sure playcount column header is only added once
      let headerRow = document.querySelector('.main-trackList-trackListHeaderRow');
      if (headerRow) {
        headerRow.insertBefore(playsHeaderColumn, lastColumn);
      }
    }

  });

  let visibleTrackList = document.querySelectorAll("div.main-trackList-indexable > div.main-rootlist-wrapper > div[role='presentation'] > div[role='row']")
  visibleTrackList.forEach((track) => {
    let trackName = (track.querySelector('div.main-trackList-rowTitle') as HTMLDivElement)
    
    let rowElement = track.querySelector('div.main-trackList-trackListRowGrid')
    if (rowElement && rowElement.querySelector('.tracklist-views-column') === null) {
      let itemPlaycount = playcounts[trackName.innerText] ?? "N/A"
      let playCountsColumn = createPlayCountColumn(itemPlaycount)

      let lastColumn = track.querySelector(".main-trackList-rowSectionEnd");
      let colIndexInt = parseInt(lastColumn.getAttribute("aria-colindex"));
      playCountsColumn.setAttribute("aria-colindex", (5).toString());
      lastColumn.setAttribute("aria-colindex", (6).toString());
      rowElement.insertBefore(playCountsColumn, lastColumn)
      if (tracklistColumnsCss[colIndexInt])
        rowElement.style["grid-template-columns"] = tracklistColumnsCss[colIndexInt]
    }

  });
}


export default main;
