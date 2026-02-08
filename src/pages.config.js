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
import ChreosiPortal from './pages/ChreosiPortal';
import CompareMerge from './pages/CompareMerge';
import CreateTestUser from './pages/CreateTestUser';
import Dashboard from './pages/Dashboard';
import DataGrid from './pages/DataGrid';
import KanaliPortal from './pages/KanaliPortal';
import NotFoundVoters from './pages/NotFoundVoters';
import Portal from './pages/Portal';
import PortalLogin from './pages/PortalLogin';
import PushMessages from './pages/PushMessages';
import SavedQueries from './pages/SavedQueries';
import UserManagement from './pages/UserManagement';
import Records from './pages/Records';
import ChreosiAccounts from './pages/ChreosiAccounts';
import KanaliAccounts from './pages/KanaliAccounts';
import __Layout from './Layout.jsx';


export const PAGES = {
    "ChreosiPortal": ChreosiPortal,
    "CompareMerge": CompareMerge,
    "CreateTestUser": CreateTestUser,
    "Dashboard": Dashboard,
    "DataGrid": DataGrid,
    "KanaliPortal": KanaliPortal,
    "NotFoundVoters": NotFoundVoters,
    "Portal": Portal,
    "PortalLogin": PortalLogin,
    "PushMessages": PushMessages,
    "SavedQueries": SavedQueries,
    "UserManagement": UserManagement,
    "Records": Records,
    "ChreosiAccounts": ChreosiAccounts,
    "KanaliAccounts": KanaliAccounts,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};