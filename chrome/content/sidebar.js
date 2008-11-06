/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Adblock Plus.
 *
 * The Initial Developer of the Original Code is
 * Wladimir Palant.
 * Portions created by the Initial Developer are Copyright (C) 2006-2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * ***** END LICENSE BLOCK ***** */

var abp = null;
try {
  abp = Components.classes["@mozilla.org/adblockplus;1"].createInstance().wrappedJSObject;

  if (abp.prefs.initialized) {
    var prefs = abp.prefs;
    var flasher = abp.flasher;
    var DataContainer = abp.DataContainer;
  }
  else
    abp = null;
} catch (e) {}

// Main browser window
var mainWin = parent;

// The window handler currently in use
var wndData = null;

var cacheSession = null;
var noFlash = false;

function E(id) {
  return document.getElementById(id);
}

function init() {
  var list = E("list");
  list.view = treeView;

  var selected = null;
  if (/sidebarDetached\.xul$/.test(parent.location.href)) {
    mainWin = parent.opener;
    mainWin.addEventListener("unload", mainUnload, false);
    E("detachButton").hidden = true;
    E("reattachButton").hidden = false;
    if (!mainWin.document.getElementById("abp-sidebar"))
      E("reattachButton").setAttribute("disabled", "true");
    if (mainWin.document.getElementById("abp-key-sidebar")) {
      var sidebarKey = mainWin.document.getElementById("abp-key-sidebar").cloneNode(true);
      parent.document.getElementById("detached-keyset").appendChild(parent.document.importNode(sidebarKey, true));
    }
  }
  window.__defineGetter__("content", function() {return mainWin.abpGetBrowser().contentWindow;});

  if (abp) {
    // Install item listener
    DataContainer.addListener(handleItemChange);

    // Restore previous state
    var params = abp.getParams();
    if (params && params.search) {
      E("searchField").value = params.search;
      treeView.setFilter(params.search);
    }
    if (params && params.focus && E(params.focus))
      E(params.focus).focus();
    else
      E("searchField").focus();

    // Activate flasher
    list.addEventListener("select", onSelectionChange, false);

    // Retrieve data for the window
    wndData = DataContainer.getDataForWindow(window.content);
    treeView.setData(wndData.getAllLocations());
    if (wndData.lastSelection) {
      noFlash = true;
      treeView.selectItem(wndData.lastSelection);
      noFlash = false;
    }

    // Install a handler for tab changes
    mainWin.abpGetBrowser().addEventListener("select", handleTabChange, false);
  }
}

// To be called for a detached window when the main window has been closed
function mainUnload() {
  parent.close();
}

// To be called on unload
function cleanUp() {
  if (!abp)
    return;

  flasher.stop();
  DataContainer.removeListener(handleItemChange);

  mainWin.abpGetBrowser().removeEventListener("select", handleTabChange, false);
  mainWin.removeEventListener("unload", mainUnload, false);
}

// Called whenever list selection changes - triggers flasher
function onSelectionChange() {
  var item = treeView.getSelectedItem();
  if (item)
    E("copy-command").removeAttribute("disabled");
  else
    E("copy-command").setAttribute("disabled", "true");
  if (item && wndData)
    wndData.lastSelection = item;

  if (!noFlash)
    flasher.flash(item ? item.nodes : null);
}

function handleItemChange(wnd, type, data, item) {
  // Check whether this applies to us
  if (wnd != window.content)
    return;

  // Maybe we got called twice
  if (type == "select" && data == wndData)
    return;

  // If adding something from a new data container - select it
  if (type == "add" && data != wndData)
    type = "select";

  var i;
  var filterSuggestions = E("suggestionsList");
  if (type == "clear") {
    // Current document has been unloaded, clear list
    wndData = null;
    treeView.setData([]);
  }
  else if (type == "select" || type == "refresh") {
    // We moved to a different document, reload list
    wndData = data;
    treeView.setData(wndData.getAllLocations());
  }
  else if (type == "invalidate")
    treeView.boxObject.invalidate();
  else if (type == "add")
    treeView.addItem(item);
}

function handleTabChange() {
  wndData = DataContainer.getDataForWindow(window.content);
  treeView.setData(wndData.getAllLocations());
  if (wndData.lastSelection) {
    noFlash = true;
    treeView.selectItem(wndData.lastSelection);
    noFlash = false;
  }
}

// Fills a box with text splitting it up into multiple lines if necessary
function setMultilineContent(box, text, noRemove)
{
  if (!noRemove)
    while (box.firstChild)
      box.removeChild(box.firstChild);

  for (var i = 0; i < text.length; i += 80)
  {
    var description = document.createElement("description");
    description.setAttribute("value", text.substr(i, 80));
    box.appendChild(description);
  }
}

// Fill in tooltip data before showing it
function fillInTooltip(e) {
  var item;
  if (treeView.data && !treeView.data.length)
    item = treeView.getDummyTooltip();
  else
    item = treeView.getItemAt(e.clientX, e.clientY);

  if (!item)
    return false;

  let filter = ("filter" in item ? item.filter : null);
  let size = ("tooltip" in item ? null : getItemSize(item));

  E("tooltipDummy").hidden = !("tooltip" in item);
  E("tooltipAddressRow").hidden = ("tooltip" in item);
  E("tooltipTypeRow").hidden = ("tooltip" in item);
  E("tooltipSizeRow").hidden = !size;
  E("tooltipFilterRow").hidden = !filter;
  E("tooltipFilterSourceRow").hidden = !(filter && filter.subscriptions.length);

  if ("tooltip" in item)
    E("tooltipDummy").setAttribute("value", item.tooltip);
  else
  {
    E("tooltipAddress").parentNode.hidden = (item.typeDescr == "ELEMHIDE");
    setMultilineContent(E("tooltipAddress"), item.location);
  
    var type = item.localizedDescr;
    if (filter && filter instanceof abp.WhitelistFilter)
      type += " " + E("tooltipType").getAttribute("whitelisted");
    else if (filter && item.typeDescr != "ELEMHIDE")
      type += " " + E("tooltipType").getAttribute("filtered");
    E("tooltipType").setAttribute("value", type);

    if (size)
      E("tooltipSize").setAttribute("value", size.join(" x "));
  }

  if (filter)
  {
    setMultilineContent(E("tooltipFilter"), filter.text);
    if (filter.subscriptions.length)
    {
      let sourceElement = E("tooltipFilterSource");
      while (sourceElement.firstChild)
        sourceElement.removeChild(sourceElement.firstChild);
      for each (let subscription in filter.subscriptions)
        setMultilineContent(sourceElement, subscription.title, true);
    }
  }

  var showPreview = prefs.previewimages && !("tooltip" in item);
  showPreview = showPreview && (item.typeDescr == "IMAGE" || item.typeDescr == "BACKGROUND");
  showPreview = showPreview && (!item.filter || item.filter instanceof abp.WhitelistFilter);
  if (showPreview) {
    // Check whether image is in cache (stolen from ImgLikeOpera)
    if (!cacheSession) {
      var cacheService = Components.classes["@mozilla.org/network/cache-service;1"]
                                   .getService(Components.interfaces.nsICacheService);
      cacheSession = cacheService.createSession("HTTP", Components.interfaces.nsICache.STORE_ANYWHERE, true);
    }

    try {
      var descriptor = cacheSession.openCacheEntry(item.location, Components.interfaces.nsICache.ACCESS_READ, false);
      descriptor.close();
    }
    catch (e) {
      showPreview = false;
    }
  }

  if (showPreview) {
    E("tooltipPreviewBox").hidden = false;
    E("tooltipPreview").setAttribute("src", "");
    E("tooltipPreview").setAttribute("src", item.location);
  }
  else
    E("tooltipPreviewBox").hidden = true;

  return true;
}

const visual = {
  OTHER: true,
  IMAGE: true,
  SUBDOCUMENT: true
}

// Fill in tooltip data before showing it
function fillInContext(e) {
  var item, allItems;
  if (treeView.data && !treeView.data.length)
  {
    item = treeView.getDummyTooltip();
    allItems = [item];
  }
  else
  {
    item = treeView.getItemAt(e.clientX, e.clientY);
    allItems = treeView.getAllSelectedItems();
  }

  if (!item || ("tooltip" in item && !("filter" in item)))
    return false;

  E("contextDisableFilter").hidden = true;
  E("contextEnableFilter").hidden = true;
  if ("filter" in item && item.filter != null)
  {
    let filter = item.filter;
    let menuItem = E("contextDisableFilter");
    menuItem.item = item;
    menuItem.filter = filter;
    menuItem.setAttribute("label", menuItem.getAttribute("labeltempl").replace(/--/, filter.text));
    menuItem.hidden = false;
  }
  else
  {
    let candidates = [];
    for each (let subscription in abp.filterStorage.subscriptions)
      if (subscription instanceof abp.SpecialSubscription && !subscription.disabled)
        for each (let filter in subscription.filters)
          if (filter.disabled && filter instanceof abp.RegExpFilter && filter.matches(item.location, item.typeDescr, item.thirdParty))
            candidates.push(filter);

    if (candidates.length)
    {
      candidates.sort(function(filter1, filter2)
      {
        if (filter1 instanceof abp.BlockingFilter && !(filter2 instanceof abp.BlockingFilter))
          return -1;
        else if (filter2 instanceof abp.BlockingFilter && !(filter1 instanceof abp.BlockingFilter))
          return 1;
        else
          return (filter1.length - filter2.length);
      });
      let filter = candidates[0];
      let menuItem = E("contextEnableFilter");
      menuItem.item = item;
      menuItem.filter = filter;
      menuItem.setAttribute("label", menuItem.getAttribute("labeltempl").replace(/--/, filter.text));
      menuItem.hidden = false;
    }
  }

  E("contextWhitelist").hidden = ("tooltip" in item || !item.filter || item.filter instanceof abp.WhitelistFilter || item.typeDescr == "ELEMHIDE");
  E("contextBlock").hidden = !E("contextWhitelist").hidden;
  E("contextBlock").setAttribute("disabled", "filter" in item && item.filter != null);
  E("contextEditFilter").setAttribute("disabled", !("filter" in item && item.filter != null));
  E("contextOpen").setAttribute("disabled", "tooltip" in item || item.typeDescr == "ELEMHIDE");
  E("contextFlash").setAttribute("disabled", "tooltip" in item || !(item.typeDescr in visual) || (item.filter && !(item.filter instanceof abp.WhitelistFilter)));
  E("contextCopyFilter").setAttribute("disabled", !allItems.some(function(item) {return "filter" in item && item.filter != null}));

  return true;
}

// Handles middle-click on an item
function openInTab(e) {
  var item = (typeof e == "undefined" ? treeView.getSelectedItem() : treeView.getItemAt(e.clientX, e.clientY));
  if (!item || item.typeDescr == "ELEMHIDE")
    return;

  if ('delayedOpenTab' in mainWin)
    mainWin.delayedOpenTab(item.location);
  else if ('getBrowser' in mainWin)
    mainWin.getBrowser().addTab(item.location);
  else {
    var uri = Components.classes["@mozilla.org/network/io-service;1"]
                        .getService(Components.interfaces.nsIIOService)
                        .newURI(item.location, null, null);

    var protocolSvc = Components.classes["@mozilla.org/uriloader/external-protocol-service;1"]
                                .getService(Components.interfaces.nsIExternalProtocolService);
    protocolSvc.loadUrl(uri);
  }
}

function doBlock() {
  if (!abp)
    return;

  var item = treeView.getSelectedItem();
  if (!item || item.typeDescr == "ELEMHIDE")
    return;

  var filter = null;
  if ("filter" in item)
    filter = item.filter;

  if (filter && filter instanceof abp.WhitelistFilter)
    return;

  openDialog("chrome://adblockplus/content/composer.xul", "_blank", "chrome,centerscreen,resizable,dialog=no,dependent", window.content, item);
}

function editFilter() {
  if (!abp)
    return;

  var item = treeView.getSelectedItem();
  if (treeView.data && !treeView.data.length)
    item = treeView.getDummyTooltip();

  if (!("filter" in item) || !item.filter)
    return;

  if (!("location") in item)
    item.location = undefined

  abp.openSettingsDialog(item.location, item.filter);
}

function enableFilter(item, filter, enable) {
  if (!abp)
    return;

  filter.disabled = !enable;
  item.filter = (enable ? filter : null);
  abp.filterStorage.triggerFilterObservers(enable ? "enable" : "disable", [filter]);
  abp.filterStorage.saveToDisk();

  treeView.boxObject.invalidate();
}

function copyToClipboard() {
  if (!abp)
    return;

  var items = treeView.getAllSelectedItems();
  if (!items.length)
    return;

  var clipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
                                  .getService(Components.interfaces.nsIClipboardHelper);
  clipboardHelper.copyString(items.map(function(item) {return item.location}).join("\n"));
}

function copyFilter() {
  if (!abp)
    return;

  var items = treeView.getAllSelectedItems().filter(function(item) {return item.filter});
  if (treeView.data && !treeView.data.length)
    items = [treeView.getDummyTooltip()];

  if (!items.length)
    return;

  var clipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
                                  .getService(Components.interfaces.nsIClipboardHelper);
  clipboardHelper.copyString(items.map(function(item) {return item.filter.text}).join("\n"));
}

function selectAll() {
  if (!abp)
    return;

  treeView.selectAll();
}

// Saves sidebar's state before detaching/reattaching
function saveState() {
  var focused = document.commandDispatcher.focusedElement;
  while (focused && (!focused.id || !("focus" in focused)))
    focused = focused.parentNode;

  var params = {
    filter: treeView.filter,
    focus: (focused ? focused.id : null)
  };
  abp.setParams(params);
}

// detaches the sidebar
function detach() {
  if (!abp)
    return;

  saveState();

  // Calculate default position for the detached window
  var boxObject = document.documentElement.boxObject;
  var position = ",left="+boxObject.screenX+",top="+boxObject.screenY+",outerWidth="+boxObject.width+",outerHeight="+boxObject.height;

  // Close sidebar and open detached window
  mainWin.abpToggleSidebar();
  mainWin.abpDetachedSidebar = mainWin.openDialog("chrome://adblockplus/content/sidebarDetached.xul", "_blank", "chrome,resizable,dependent,dialog=no"+position);

  // Save setting
  prefs.detachsidebar = true;
  prefs.save();
}

// reattaches the sidebar
function reattach() {
  if (!abp)
    return;

  saveState();

  // Save setting
  prefs.detachsidebar = false;
  prefs.save();

  // Open sidebar in window
  mainWin.abpDetachedSidebar = null;
  mainWin.abpToggleSidebar();
  parent.close();
}

// Returns items size in the document if available
function getItemSize(item)
{
  if (item.filter && item.filter instanceof abp.BlockingFilter)
    return null;

  for each (let node in item.nodes)
  {
    if (node instanceof HTMLImageElement && (node.naturalWidth || node.naturalHeight))
      return [node.naturalWidth, node.naturalHeight];
    else if (node instanceof HTMLElement && (node.offsetWidth || node.offsetHeight))
      return [node.offsetWidth, node.offsetHeight];
  }
  return null;
}

// Sort functions for the item list
function sortByAddress(item1, item2) {
  if (item1.location < item2.location)
    return -1;
  else if (item1.location > item2.location)
    return 1;
  else
    return 0;
}

function sortByAddressDesc(item1, item2) {
  return -sortByAddress(item1, item2);
}

function compareType(item1, item2) {
  if (item1.localizedDescr < item2.localizedDescr)
    return -1;
  else if (item1.localizedDescr > item2.localizedDescr)
    return 1;
  else
    return 0;
}

function compareFilter(item1, item2) {
  var hasFilter1 = (item1.filter ? 1 : 0);
  var hasFilter2 = (item2.filter ? 1 : 0);
  if (hasFilter1 != hasFilter2)
    return hasFilter1 - hasFilter2;
  else if (hasFilter1 && item1.filter.text < item2.filter.text)
    return -1;
  else if (hasFilter1 && item1.filter.text > item2.filter.text)
    return 1;
  else
    return 0;
}

function compareState(item1, item2) {
  var state1 = (!item1.filter ? 0 : (item1.filter instanceof abp.WhitelistFilter ? 1 : 2));
  var state2 = (!item2.filter ? 0 : (item2.filter instanceof abp.WhitelistFilter ? 1 : 2));
  return state1 - state2;
}

function compareSize(item1, item2) {
  var size1 = getItemSize(item1);
  size1 = size1 ? size1[0] * size1[1] : 0;

  var size2 = getItemSize(item2);
  size2 = size2 ? size2[0] * size2[1] : 0;
  return size1 - size2;
}

function createSortWithFallback(cmpFunc, fallbackFunc, desc) {
  var factor = (desc ? -1 : 1);

  return function(item1, item2) {
    var ret = cmpFunc(item1, item2);
    if (ret == 0)
      return fallbackFunc(item1, item2);
    else
      return factor * ret;
  }
}

// Item list's tree view object
var treeView = {
  //
  // nsISupports implementation
  //

  QueryInterface: function(uuid) {
    if (!uuid.equals(Components.interfaces.nsISupports) &&
        !uuid.equals(Components.interfaces.nsITreeView))
    {
      throw Components.results.NS_ERROR_NO_INTERFACE;
    }
  
    return this;
  },

  //
  // nsITreeView implementation
  //

  selection: null,

  setTree: function(boxObject) {
    if (!boxObject)
      return;

    this.boxObject = boxObject;
    this.itemsDummy = boxObject.treeBody.getAttribute("noitemslabel");
    this.whitelistDummy = boxObject.treeBody.getAttribute("whitelistedlabel");
    this.loadDummy = boxObject.treeBody.getAttribute("notloadedlabel");

    var stringAtoms = ["col-address", "col-type", "col-filter", "col-state", "col-size", "state-regular", "state-filtered", "state-whitelisted", "state-hidden"];
    var boolAtoms = ["selected", "dummy"];
    var atomService = Components.classes["@mozilla.org/atom-service;1"]
                                .getService(Components.interfaces.nsIAtomService);

    this.atoms = {};
    for each (let atom in stringAtoms)
      this.atoms[atom] = atomService.getAtom(atom);
    for each (let atom in boolAtoms)
    {
      this.atoms[atom + "-true"] = atomService.getAtom(atom + "-true");
      this.atoms[atom + "-false"] = atomService.getAtom(atom + "-false");
    }

    if (abp) {
      this.itemsDummyTooltip = abp.getString("no_blocking_suggestions");
      this.whitelistDummyTooltip = abp.getString("whitelisted_page");
    }

    // Check current sort direction
    var cols = document.getElementsByTagName("treecol");
    var sortDir = null;
    for (let i = 0; i < cols.length; i++) {
      var col = cols[i];
      var dir = col.getAttribute("sortDirection");
      if (dir && dir != "natural") {
        this.sortColumn = col;
        sortDir = dir;
      }
    }
    if (!this.sortColumn)
    {
      let defaultSort = E("list").getAttribute("defaultSort");
      if (/^(\w+)\s+(ascending|descending)$/.test(defaultSort))
      {
        this.sortColumn = E(RegExp.$1);
        if (this.sortColumn)
        {
          sortDir = RegExp.$2;
          this.sortColumn.setAttribute("sortDirection", sortDir);
        }
      }
    }

    if (sortDir)
    {
      this.sortProc = this.sortProcs[this.sortColumn.id + (sortDir == "descending" ? "Desc" : "")];
      E("list").setAttribute("defaultSort", " ");
    }

    // Make sure to update the dummy row every two seconds
    setInterval(function(view) {
      if (!view.data || !view.data.length)
        view.boxObject.invalidateRow(0);
    }, 2000, this);

    // Prevent a reference through closures
    boxObject = null;
  },

  get rowCount() {
    return (this.data && this.data.length ? this.data.length : 1);
  },

  getCellText: function(row, col) {
    col = col.id;

    // Only two columns have text
    if (col != "type" && col != "address" && col != "filter" && col != "size")
      return "";

    if (this.data && this.data.length) {
      if (row >= this.data.length)
        return "";

      if (col == "type")
        return this.data[row].localizedDescr;
      else if (col == "filter")
        return (this.data[row].filter ? this.data[row].filter.text : "");
      else if (col == "size")
      {
        let size = getItemSize(this.data[row]);
        return (size ? size.join(" x ") : "");
      }
      else
        return this.data[row].location;
    }
    else {
      // Empty list, show dummy
      if (row > 0 || (col != "address" && col != "filter"))
        return "";

      if (!this.data)
        return (col == "address" ? this.loadDummy : "");

      if (col == "filter") {
        var filter = abp.policy.isWindowWhitelisted(window.content);
        return filter ? filter.text : "";
      }

      return (abp.policy.isWindowWhitelisted(window.content) ? this.whitelistDummy : this.itemsDummy);
    }
  },

  getColumnProperties: function(col, properties) {
    col = col.id;

    if ("col-" + col in this.atoms)
      properties.AppendElement(this.atoms["col-" + col]);
  },

  getRowProperties: function(row, properties) {
    if (row >= this.rowCount)
      return;

    properties.AppendElement(this.atoms["selected-" + this.selection.isSelected(row)]);

    var state;
    if (this.data && this.data.length) {
      properties.AppendElement(this.atoms["dummy-false"]);

      state = "state-regular";
      if (this.data[row].filter)
      {
        if (this.data[row].filter instanceof abp.WhitelistFilter)
          state = "state-whitelisted";
        else if (this.data[row].filter instanceof abp.BlockingFilter)
          state = "state-filtered";
        else if (this.data[row].filter instanceof abp.ElemHideFilter)
          state = "state-hidden";
      }
    }
    else {
      properties.AppendElement(this.atoms["dummy-true"]);

      state = "state-filtered";
      if (this.data && abp.policy.isWindowWhitelisted(window.content))
        state = "state-whitelisted";
    }
    properties.AppendElement(this.atoms[state]);
  },

  getCellProperties: function(row, col, properties)
  {
    this.getColumnProperties(col, properties);
    this.getRowProperties(row, properties);
  },

  cycleHeader: function(col) {
    col = col.id;

    col = E(col);
    if (!col)
      return;

    var cycle = {
      natural: 'ascending',
      ascending: 'descending',
      descending: 'natural'
    };

    var curDirection = "natural";
    if (this.sortColumn == col)
      curDirection = col.getAttribute("sortDirection");
    else if (this.sortColumn)
      this.sortColumn.removeAttribute("sortDirection");

    curDirection = cycle[curDirection];

    if (curDirection == "natural")
      this.sortProc = null;
    else
      this.sortProc = this.sortProcs[col.id + (curDirection == "descending" ? "Desc" : "")];

    if (this.data)
      this.refilter();

    col.setAttribute("sortDirection", curDirection);
    this.sortColumn = col;

    this.boxObject.invalidate();
  },

  isSorted: function() {
    return this.sortProc;
  },

  isContainer: function() {return false},
  isContainerOpen: function() {return false},
  isContainerEmpty: function() {return false},
  getLevel: function() {return 0},
  getParentIndex: function() {return -1},
  hasNextSibling: function() {return false},
  toggleOpenState: function() {},
  canDrop: function() {return false},
  drop: function() {},
  getCellValue: function() {return null},
  getProgressMode: function() {return null},
  getImageSrc: function() {return null},
  isSeparator: function() {return false},
  isEditable: function() {return false},
  cycleCell: function() {},
  performAction: function() {},
  performActionOnRow: function() {},
  performActionOnCell: function() {},
  selectionChanged: function() {},

  //
  // Custom properties and methods
  //

  boxObject: null,
  atoms: null,
  filter: "",
  data: null,
  allData: [],
  sortColumn: null,
  sortProc: null,
  resortTimeout: null,
  itemsDummy: null,
  whitelistDummy: null,
  itemsDummyTooltip: null,
  whitelistDummyTooltip: null,
  loadDummy: null,

  sortProcs: {
    address: sortByAddress,
    addressDesc: sortByAddressDesc,
    type: createSortWithFallback(compareType, sortByAddress, false),
    typeDesc: createSortWithFallback(compareType, sortByAddress, true),
    filter: createSortWithFallback(compareFilter, sortByAddress, false),
    filterDesc: createSortWithFallback(compareFilter, sortByAddress, true),
    state: createSortWithFallback(compareState, sortByAddress, false),
    stateDesc: createSortWithFallback(compareState, sortByAddress, true),
    size: createSortWithFallback(compareSize, sortByAddress, false),
    sizeDesc: createSortWithFallback(compareSize, sortByAddress, true)
  },

  setData: function(data) {
    var oldRows = this.rowCount;

    this.allData = data;
    this.refilter();

    this.boxObject.rowCountChanged(0, -oldRows);
    this.boxObject.rowCountChanged(0, this.rowCount);
  },

  addItem: function(item) {
    this.allData.push(item);
    if (this.filter && item.location.toLowerCase().indexOf(this.filter) < 0 && item.localizedDescr.toLowerCase().indexOf(this.filter) < 0)
      return;

    var index = -1;
    if (this.sortProc && this.sortColumn && this.sortColumn.id == "size")
    {
      // Sorting by size requires accessing content document, and that's
      // dangerous from a content policy (and we are likely called directly
      // from a content policy call). Size data will be inaccurate anyway,
      // delay sorting until later.
      if (this.resortTimeout)
        clearTimeout(this.resortTimeout);
      this.resortTimeout = setTimeout(function(me)
      {
        if (me.sortProc)
          me.data.sort(me.sortProc);
        me.boxObject.invalidate();
      }, 500, this);
    }
    else if (this.sortProc)
      for (var i = 0; index < 0 && i < this.data.length; i++)
        if (this.sortProc(item, this.data[i]) < 0)
          index = i;

    if (index >= 0)
      this.data.splice(index, 0, item);
    else {
      this.data.push(item);
      index = this.data.length - 1;
    }

    if (this.data.length == 1)
      this.boxObject.invalidateRow(0);
    else
      this.boxObject.rowCountChanged(index, 1);
  },

  refilter: function() {
    if (this.resortTimeout)
      clearTimeout(this.resortTimeout);

    this.data = [];
    for (var i = 0; i < this.allData.length; i++)
      if (!this.filter || this.allData[i].location.toLowerCase().indexOf(this.filter) >= 0 || this.allData[i].localizedDescr.toLowerCase().indexOf(this.filter) >= 0)
        this.data.push(this.allData[i]);

    if (this.sortProc)
      this.data.sort(this.sortProc);
  },

  setFilter: function(filter) {
    var oldRows = this.rowCount;

    this.filter = filter.toLowerCase();
    this.refilter();

    var newRows = this.rowCount;
    if (oldRows != newRows)
      this.boxObject.rowCountChanged(oldRows < newRows ? oldRows : newRows, this.rowCount - oldRows);
    this.boxObject.invalidate();
  },

  selectAll: function() {
    this.selection.selectAll();
  },

  getSelectedItem: function() {
    if (!this.data || this.selection.currentIndex < 0 || this.selection.currentIndex >= this.data.length)
      return null;

    return this.data[this.selection.currentIndex];
  },

  getAllSelectedItems: function() {
    let result = [];
    if (!this.data)
      return result;

    let numRanges = this.selection.getRangeCount();
    for (let i = 0; i < numRanges; i++)
    {
      let min = {};
      let max = {};
      let range = this.selection.getRangeAt(i, min, max);
      for (let j = min.value; j <= max.value; j++)
      {
        if (j >= 0 && j < this.data.length)
          result.push(this.data[j]);
      }
    }
    return result;
  },

  getItemAt: function(x, y) {
    if (!this.data)
      return null;

    var row = this.boxObject.getRowAt(x, y);
    if (row < 0 || row >= this.data.length)
      return null;

    return this.data[row];
  },

  getDummyTooltip: function() {
    if (!this.data || this.data.length)
      return null;

    var filter = abp.policy.isWindowWhitelisted(window.content);
    if (filter)
      return {tooltip: this.whitelistDummyTooltip, filter: filter};
    else
      return {tooltip: this.itemsDummyTooltip};
  },

  selectItem: function(item) {
    var row = -1;
    for (var i = 0; row < 0 && i < this.data.length; i++)
      if (this.data[i] == item)
        row = i;

    if (row < 0 )
      return;

    this.selection.select(row);
    this.boxObject.ensureRowIsVisible(row);
  }
}
