/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import ChreosiAccounts from './pages/ChreosiAccounts';
import ChreosiPortal from './pages/ChreosiPortal';
import CompareMerge from './pages/CompareMerge';
import Dashboard from './pages/Dashboard';
import DataGrid from './pages/DataGrid';
import KanaliAccounts from './pages/KanaliAccounts';
import KanaliPortal from './pages/KanaliPortal';
import NotFoundVoters from './pages/NotFoundVoters';
import Portal from './pages/Portal';
import PortalLogin from './pages/PortalLogin';
import PushMessages from './pages/PushMessages';
import Records from './pages/Records';
import SavedQueries from './pages/SavedQueries';
import UserManagement from './pages/UserManagement';
import CreateTestUser from './pages/CreateTestUser';
import __Layout from './Layout.jsx';


export const PAGES = {
    "ChreosiAccounts": ChreosiAccounts,
    "ChreosiPortal": ChreosiPortal,
    "CompareMerge": CompareMerge,
    "Dashboard": Dashboard,
    "DataGrid": DataGrid,
    "KanaliAccounts": KanaliAccounts,
    "KanaliPortal": KanaliPortal,
    "NotFoundVoters": NotFoundVoters,
    "Portal": Portal,
    "PortalLogin": PortalLogin,
    "PushMessages": PushMessages,
    "Records": Records,
    "SavedQueries": SavedQueries,
    "UserManagement": UserManagement,
    "CreateTestUser": CreateTestUser,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};