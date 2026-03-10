import React, { useState, useEffect, useRef } from 'react';
import { Share2, Clock, RefreshCw, ChevronRight, CheckCircle, Database, Trash2, HelpCircle, X, Download, Filter, Layout, Search, Moon, Sun, ArrowRight, FileText, Globe, Cloud, RotateCcw, AlertCircle, AlertTriangle, Zap, Check, Phone, MapPin } from 'lucide-react';
import { syncSheet, getHistory, getData, deleteRecord, apiBase } from './services/api';
import { format } from 'date-fns';
import axios from 'axios';

function App() {
  const [userEmail, setUserEmail] = useState(localStorage.getItem('sf_user_email') || '');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Main App States
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [viewData, setViewData] = useState([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [deleteInputId, setDeleteInputId] = useState('');

  const detailsRef = useRef(null);

  useEffect(() => {
    if (selectedBatch && detailsRef.current) {
      detailsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedBatch]);
  const [primaryEmail, setPrimaryEmail] = useState('mansikharb.kc@gmail.com');

  // Global Leads States
  const [allLeads, setAllLeads] = useState([]);
  const [totalLeads, setTotalLeads] = useState(0);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsSearch, setLeadsSearch] = useState('');
  const [leadsCategory, setLeadsCategory] = useState('all');
  const [leadsPage, setLeadsPage] = useState(0);
  const [leadsLimit] = useState(50);
  const [activeView, setActiveView] = useState('leads'); // 'google-import', 'zoho-export', 'leads'
  const [isDarkMode, setIsDarkMode] = useState(localStorage.getItem('sf_theme') === 'dark');

  // --- ZOHO LOGIC START ---
  const [zohoLeads, setZohoLeads] = useState([]);
  const [zohoLoading, setZohoLoading] = useState(false);
  const [selectedBatchIndex, setSelectedBatchIndex] = useState(null);
  const [zohoSyncLoading, setZohoSyncLoading] = useState(false);
  const [zohoConnected, setZohoConnected] = useState(false);
  const [zohoHistory, setZohoHistory] = useState([]);
  const [zohoHistoryLoading, setZohoHistoryLoading] = useState(false);
  const [zohoStats, setZohoStats] = useState([]);
  const [leadsStats, setLeadsStats] = useState({ daily_new_leads: 0, monthly_new_leads: 0 });

  const fetchLeadsStats = async () => {
    try {
      const { getStats } = await import('./services/api');
      const data = await getStats();
      setLeadsStats(data);
    } catch (e) {
      console.error("Failed to fetch leads stats", e);
    }
  };

  useEffect(() => {
    if (userEmail) fetchLeadsStats();
  }, [userEmail]);

  useEffect(() => {
    if (activeView === 'zoho-export') {
      fetchZohoData();
      checkZohoStatus();
      fetchZohoHistory();
    }
  }, [activeView]);

  const checkZohoStatus = async () => {
    try {
      const { data } = await axios.get(`${apiBase}/api/zoho/status`);
      // Treat "connected but no API access" as OFFLINE for automation purposes
      if (data.connected && data.apiAccess === false) {
        setZohoConnected(false);
      } else {
        setZohoConnected(data.connected);
      }
    } catch (e) {
      setZohoConnected(false);
    }
  };

  const handleConnectZoho = async () => {
    try {
      // Prevent non-primary users from overwriting the shared Zoho OAuth tokens
      if (userEmail && primaryEmail && userEmail.toLowerCase() !== primaryEmail.toLowerCase()) {
        alert(`Only the primary admin (${primaryEmail}) can activate/reconnect Zoho. Please contact the administrator.`);
        return;
      }
      const { data } = await axios.get(`${apiBase}/api/zoho/auth-url`);
      if (data.url) {
        // Open Zoho auth in a new window/popup
        window.open(data.url, 'ZohoAuth', 'width=600,height=700');
      }
    } catch (e) {
      alert('Failed to get connection URL: ' + e.message);
    }
  };

  const ZOHO_BATCH_SIZE = 500; // Records per batch

  const fetchZohoData = async () => {
    setZohoLoading(true);
    try {
      const { data } = await axios.get(`${apiBase}/api/zoho/leads?status=Active&limit=10000`);

      let leads = data.leads || [];
      // Sort by ID ASC (oldest first, so batches are sequential)
      leads.sort((a, b) => a.id - b.id);

      setZohoLeads(leads);
      if (data.stats) setZohoStats(data.stats);
      // Removed auto-selection of first batch to show "Waiting for Selection" screen
    } catch (e) {
      console.error(e);
    } finally {
      setZohoLoading(false);
    }
  };

  const fetchZohoHistory = async () => {
    setZohoHistoryLoading(true);
    try {
      const { data } = await axios.get(`${apiBase}/api/zoho/leads?status=Success&limit=2000`);
      setZohoHistory(data.leads || []);
      if (data.stats) setZohoStats(data.stats);
    } catch (e) {
      console.error("Failed to fetch Zoho history", e);
    } finally {
      setZohoHistoryLoading(false);
    }
  };

  const handleZohoBatchSync = async (batchIndex) => {
    setZohoSyncLoading(true);
    try {
      // Calculate slices - changed from 20 to 500
      const start = batchIndex * 500;
      const end = start + 500;
      const batchToSync = zohoLeads.slice(start, end);
      const leadIds = batchToSync.map(l => l.id);

      const { data } = await axios.post(`${apiBase}/api/zoho/sync`, { leadIds });

      const successCount = data.results.filter(r => r.status === 'SUCCESS').length;
      const failCount = data.results.length - successCount;

      alert(`✅ Batch Sync Completed!\n${successCount} Successfully pushed to CRM\n${failCount} Failed.`);
      await fetchZohoData(); // Refresh list (synced items removed from pending)
      await fetchZohoHistory(); // Refresh history panel below
      setSelectedBatchIndex(0); // Reset to first batch
    } catch (e) {
      alert('Sync Failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setZohoSyncLoading(false);
    }
  };

  const handleZohoSyncSingle = async (lead) => {
    try {
      const { data } = await axios.post(`${apiBase}/api/zoho/sync`, { leadIds: [lead.id] });
      if (data.results[0].status === 'SUCCESS') {
        alert('✅ Successfully pushed to Zoho CRM!');
        fetchZohoData();
        fetchZohoHistory();
        fetchLeadsStats();
      } else {
        alert('Push Failed: ' + data.results[0].error);
        fetchZohoData();
      }
    } catch (e) {
      const status = e.response?.status;
      const errMsg = e.response?.data?.error || e.message;
      if (status === 403 || (errMsg && errMsg.includes('ZOHO_NOT_CONFIGURED'))) {
        const reconnect = window.confirm('⚠️ Zoho CRM session has expired or is not connected.\n\nClick OK to re-connect Zoho now.');
        if (reconnect) handleConnectZoho();
      } else {
        alert('Push Error: ' + errMsg);
      }
    }
  };

  const handleZohoUndo = async (lead) => {
    try {
      const { data } = await axios.post(`${apiBase}/api/zoho/undo`, { leadId: lead.id });
      alert(data.message || 'Successfully Reverted!');
      fetchZohoData();
      fetchZohoHistory();
    } catch (e) {
      alert('Undo Failed: ' + (e.response?.data?.error || e.message));
    }
  };

  const handleZohoUndoAll = async () => {
    if (!window.confirm("ARE YOU ABSOLUTELY SURE?\n\nThis will move ALL synced records back to the pending staging area.\n\nNote: Zoho CRM records will NOT be deleted automatically.")) return;

    setZohoHistoryLoading(true);
    try {
      const { data } = await axios.post(`${apiBase}/api/zoho/undo-all`);
      alert(data.message || 'Successfully Reverted All!');
      await fetchZohoData();
      await fetchZohoHistory();
    } catch (e) {
      alert('Undo All Failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setZohoHistoryLoading(false);
    }
  };
  // --- ZOHO LOGIC END ---

  const [stagingProcessing, setStagingProcessing] = useState(false);

  const handleStageLeads = async () => {
    setStagingProcessing(true);
    try {
      await axios.post(`${apiBase}/api/crm-sync/stage`);
      await fetchZohoData();
      alert('New leads identified and staged for review!');
    } catch (e) {
      alert('Staging failed: ' + e.message);
    } finally {
      setStagingProcessing(false);
    }
  };

  const handlePushAllToZoho = async () => {
    setStagingProcessing(true);
    try {
      const { data } = await axios.post(`${apiBase}/api/crm-sync/process`);
      const success = data.results.filter(r => r.status === 'SUCCESS').length;
      alert(`✅ Bulk Sync Completed: ${success} Pushed, ${data.results.length - success} Failed.`);
      await fetchZohoData();
      await fetchZohoHistory();
      await fetchLeadsStats();
    } catch (e) {
      const status = e.response?.status;
      const errMsg = e.response?.data?.error || e.message;
      if (status === 403 || (errMsg && (errMsg.includes('ZOHO_NOT_CONFIGURED') || errMsg.includes('invalid_token') || errMsg.includes('invalid_code')))) {
        const reconnect = window.confirm('⚠️ Zoho CRM session expired or not connected.\n\nYou need to re-authorize the connection first.\n\nClick OK to open Zoho authorization.');
        if (reconnect) handleConnectZoho();
      } else {
        alert('Bulk Sync Failed: ' + errMsg);
      }
    } finally {
      setStagingProcessing(false);
    }
  };

  // Dark Mode Effect
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('sf_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('sf_theme', 'light');
    }
  }, [isDarkMode]);


  // Load history on mount (only if logged in)
  useEffect(() => {
    // Also fetch config
    const fetchConfig = async () => {
      try {
        const { getConfig } = await import('./services/api');
        const config = await getConfig();
        if (config.primaryAdminEmail) {
          setPrimaryEmail(config.primaryAdminEmail);
        }
      } catch (e) {
        console.warn("Failed to fetch backend config", e);
      }
    };
    fetchConfig();

    if (userEmail) {
      fetchHistory();
      // Fetch leads immediately
      fetchLeads();

      const interval = setInterval(() => {
        fetchHistory();
        if (activeView === 'leads') fetchLeads();
        if (activeView === 'zoho-export') {
          fetchZohoData();
          fetchZohoHistory();
        }
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [userEmail, activeView]);

  // Refetch leads when search, category, or page changes (with Debounce)
  useEffect(() => {
    if (userEmail && activeView === 'leads') {
      const timer = setTimeout(() => {
        fetchLeads();
      }, 500); // 500ms delay
      return () => clearTimeout(timer);
    }
  }, [leadsSearch, leadsCategory, leadsPage]);


  const fetchHistory = async (filters = {}) => {
    try {
      const { getHistory } = await import('./services/api');
      const data = await getHistory(filters);
      setHistory(data);
    } catch (error) {
      console.error("Failed to load history", error);
    }
  };

  const fetchLeads = async () => {
    setLeadsLoading(true);
    try {
      const { getLeads } = await import('./services/api');
      const data = await getLeads(leadsSearch, leadsCategory, leadsLimit, leadsPage * leadsLimit);
      console.log('Fetched Leads:', data);
      setAllLeads(Array.isArray(data.leads) ? data.leads : []);
      setTotalLeads(data.total || 0);
    } catch (error) {
      console.error("Failed to load leads", error);
      setAllLeads([]);
    } finally {
      setLeadsLoading(false);
    }
  };


  const handleSync = async () => {
    setLoading(true);
    setSyncResult(null);
    try {
      const { syncSheet } = await import('./services/api');
      const result = await syncSheet(null);
      if (result.started) {
        alert("Sync started in the background! Please wait 1-2 minutes for the data to appear.");
      } else {
        setSyncResult(result);
      }
      setTimeout(() => {
        fetchHistory();
        fetchLeadsStats();
      }, 3000);
    } catch (error) {
      console.error("Sync error details:", error);
      if (error.response && error.response.status === 409) {
        alert("Sync is already running! Please wait.");
      } else {
        const errorData = error.response?.data;
        const errorMsg = errorData?.error || errorData?.message || error.message || "Unknown error";
        alert("Sync Failed: " + errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleViewData = async (log) => {
    setSelectedBatch(log);
    setViewLoading(true);
    try {
      const { getData } = await import('./services/api');
      // Pass both batch_id and sync_log_id (log.id)
      const data = await getData(log.table_name || 'leads', log.batch_id, log.id);
      setViewData(data);
    } catch (error) {
      console.error("Failed to load data", error);
    } finally {
      setViewLoading(false);
    }
  };

  const closeDataView = () => {
    setSelectedBatch(null);
    setViewData([]);
  };

  const handleDelete = async (row) => {
    const id = row.sheet_id;
    if (!id) {
      alert("Error: Cannot identify record ID (sheet_id is missing)");
      return;
    }
    if (!window.confirm(`Are you sure you want to permanently delete record ${id}?`)) {
      return;
    }
    try {
      const { deleteRecord } = await import('./services/api');
      const tableName = selectedBatch?.table_name || 'leads';
      await deleteRecord(tableName, id);
      setViewData(prev => prev.filter(item => item.sheet_id !== id));
    } catch (error) {
      console.error("Failed to delete record", error);
      alert("Delete Failed: " + (error.response?.data?.error || error.message));
    }
  };

  const handleManualDelete = async () => {
    if (!deleteInputId.trim()) {
      alert("Please enter a valid Leads ID (Sheet ID).");
      return;
    }
    if (!window.confirm(`Are you sure you want to permanently delete record ${deleteInputId}?`)) {
      return;
    }
    setLoading(true);
    try {
      const { deleteRecord } = await import('./services/api');
      await deleteRecord('leads', deleteInputId);
      alert("Record deleted successfully.");
      setDeleteInputId('');
      if (selectedBatch && selectedBatch.table_name === 'leads') {
        handleViewData(selectedBatch);
      } else {
        fetchHistory();
      }
    } catch (error) {
      console.error("Manual delete failed", error);
      alert("Delete Failed: " + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setLoginError('');
    setLoginPendingMessage(null);
    try {
      const { loginUser } = await import('./services/api');
      const result = await loginUser(loginEmail, loginPassword);

      if (result.pending) {
        setLoginPendingMessage(result.message);
      } else if (result.success) {
        localStorage.setItem('sf_user_email', loginEmail.toLowerCase());
        setUserEmail(loginEmail.toLowerCase());
        setLoginError('');
      } else {
        setLoginError("Invalid credentials. Please try again.");
      }
    } catch (error) {
      console.error("Login Error:", error);
      const errorData = error.response?.data;
      const status = error.response?.status;

      if (status === 401) {
        setLoginError("Invalid email or password. Remember: Password is case-sensitive (e.g., Admin@123).");
      } else if (status === 403) {
        setLoginError(errorData?.error || "Account not active.");
      } else if (error.message === "Network Error") {
        setLoginError("Network Error: Cannot connect to the backend server. Is it running on port 5000?");
      } else {
        const errorMsg = errorData?.error || error.message || "Login failed. Please try again.";
        setLoginError(`Error (${status || 'Unknown'}): ${errorMsg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const [loginPendingMessage, setLoginPendingMessage] = useState(null);
  const [showRegister, setShowRegister] = useState(false);
  const [regStep, setRegStep] = useState(1); // 1: Form, 2: OTP
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regOtp, setRegOtp] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setRegLoading(true);
    setRegError('');

    if (regPassword !== regConfirmPassword) {
      setRegError("Passwords do not match.");
      setRegLoading(false);
      return;
    }

    try {
      const { requestOTP } = await import('./services/api');
      const res = await requestOTP(regEmail, regPassword, regConfirmPassword);
      setRegStep(2);
      // Backend message says OTP sent to admin
    } catch (error) {
      setRegError(error.response?.data?.error || "Request failed. Please try again.");
    } finally {
      setRegLoading(false);
    }
  };

  const handleVerifyAndRegister = async (e) => {
    e.preventDefault();
    setRegLoading(true);
    setRegError('');

    try {
      const { verifyOTP, registerUser } = await import('./services/api');

      // Step 2: Verify
      await verifyOTP(regEmail, regOtp);

      // Step 3: Register
      const res = await registerUser(regEmail, regPassword);
      setRegSuccess(res.message);
      setRegStep(1); // Reset for next time
    } catch (error) {
      setRegError(error.response?.data?.error || "Registration failed. Please check OTP.");
    } finally {
      setRegLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('sf_user_email');
    setUserEmail('');
    setLoginEmail('');
    setLoginPassword('');
    setLoginPendingMessage(null);
  };

  if (!userEmail) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-8 rounded-3xl shadow-2xl space-y-8 animate-in fade-in zoom-in duration-500">
            <div className="text-center space-y-2">
              <div className="inline-flex p-4 rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-500/50 mb-4">
                <Database className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-white tracking-tight">SyncFlow</h1>
              <p className="text-slate-400">Company Database Automation</p>
            </div>

            {showRegister ? (
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-xl font-bold text-white">Create Account</h2>
                  <p className="text-slate-400 text-sm">Request access to SyncFlow</p>
                </div>

                {regSuccess ? (
                  <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-center space-y-4">
                    <div className="space-y-2">
                      <p className="text-emerald-500 font-bold">Success!</p>
                      <p className="text-slate-300 text-sm">{regSuccess}</p>
                    </div>
                    <button
                      onClick={() => {
                        setShowRegister(false);
                        setRegSuccess('');
                        setRegEmail('');
                        setRegPassword('');
                        setRegConfirmPassword('');
                        setRegOtp('');
                      }}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition-all"
                    >
                      Sign In Now
                    </button>
                  </div>
                ) : regStep === 1 ? (
                  <form onSubmit={handleRequestOtp} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-300 ml-1">Email</label>
                      <input
                        type="email"
                        required
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="your@email.com"
                        className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-300 ml-1">Password</label>
                      <input
                        type="password"
                        required
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="Set a password"
                        className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-300 ml-1">Confirm Password</label>
                      <input
                        type="password"
                        required
                        value={regConfirmPassword}
                        onChange={(e) => setRegConfirmPassword(e.target.value)}
                        placeholder="Confirm your password"
                        className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>

                    {regError && (
                      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center">
                        {regError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={regLoading}
                      className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold shadow-xl shadow-indigo-600/30 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 group"
                    >
                      {regLoading ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <FileText className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                          Proceed to OTP
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowRegister(false); }}
                      className="w-full text-sm text-slate-500 hover:text-white transition-colors pt-2"
                    >
                      Wait, I have an account. Sign In
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyAndRegister} className="space-y-4">
                    <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl space-y-2 animate-in fade-in duration-500">
                      <p className="text-indigo-400 font-bold text-sm flex items-center gap-2">
                        <Database className="w-4 h-4" /> OTP Sent to Admin
                      </p>
                      <p className="text-slate-300 text-xs leading-relaxed">
                        An OTP has been sent to the primary administrator.<br />
                        Please contact <span className="text-indigo-400 font-medium">mansikharb.kc@gmail.com</span> to get the 6-digit code.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-indigo-400 ml-1 font-bold">Verification OTP</label>
                      <input
                        type="text"
                        required
                        value={regOtp}
                        onChange={(e) => setRegOtp(e.target.value)}
                        placeholder="Enter 6-digit code"
                        maxLength={6}
                        className="w-full px-5 py-4 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl text-white text-center text-3xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                      />
                    </div>

                    {regError && (
                      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center">
                        {regError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={regLoading}
                      className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold shadow-xl shadow-emerald-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                      {regLoading ? 'Verifying...' : 'Complete Registration'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setRegStep(1)}
                      className="w-full text-sm text-slate-500 hover:text-indigo-400 transition-colors pt-2"
                    >
                      ← Back to Details
                    </button>
                  </form>
                )}
              </div>
            ) : loginPendingMessage ? (
              <div className="space-y-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-4">
                  <h2 className="text-xl font-bold text-amber-500">Access Restricted</h2>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    Only approved users can sign in.<br />
                    If you do not have access, please request approval from the administrator.
                  </p>
                  <div className="pt-2">
                    <p className="text-xs text-slate-500 mb-3 uppercase tracking-wider font-semibold">👉 Administrator:</p>
                    <a
                      href={`mailto:${primaryEmail}?subject=Access Request&body=Please approve my access for email: ${loginEmail}`}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-xl font-bold transition-all hover:scale-[1.05] active:scale-[0.95]"
                    >
                      Contact Administrator
                    </a>
                  </div>
                  <p className="text-[10px] text-slate-500 italic mt-4">
                    Once approved by {primaryEmail}, you will be able to log in.
                  </p>
                </div>
                <button
                  onClick={() => setLoginPendingMessage(null)}
                  className="text-sm text-slate-400 hover:text-white transition-colors underline underline-offset-4"
                >
                  Back to Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300 ml-1">Work Email</label>
                    <input
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="Enter your email"
                      className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300 ml-1">Password</label>
                    <input
                      type="password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                {loginError && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm animate-shake text-center">
                    {loginError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-semibold shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70"
                >
                  {loading ? 'Verifying...' : 'Sign In'}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setShowRegister(true)}
                    className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors font-medium border-b border-indigo-400/30 hover:border-indigo-400 pb-0.5"
                  >
                    Don't have access? Create Account
                  </button>
                </div>
              </form>
            )}

            <div className="text-center">
              <p className="text-xs text-slate-500">
                Authorized Personnel Only • Reach out to {primaryEmail}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 font-sans selection:bg-indigo-100 transition-colors duration-300">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="bg-indigo-600 p-2 rounded-lg">
                <Database className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">
                SyncFlow
              </h1>
            </div>

            <nav className="hidden lg:flex items-center gap-1">
              <button
                onClick={() => setActiveView('google-import')}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeView === 'google-import' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                <Cloud className="w-4 h-4" />
                Google Import
              </button>
              <button
                onClick={() => setActiveView('zoho-export')}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeView === 'zoho-export' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                <Share2 className="w-4 h-4" />
                Zoho Export
              </button>
              <button
                onClick={() => setActiveView('leads')}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeView === 'leads' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                <Database className="w-4 h-4" />
                Leads
              </button>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
              title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-xs font-semibold text-slate-900 dark:text-white">{userEmail}</span>
              <span className="text-[10px] text-slate-400">Primary Admin</span>
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="lg:hidden px-4 pb-4 flex justify-center border-t border-slate-50 pt-3 gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveView('google-import')}
            className={`px-4 py-3 rounded-xl text-[10px] uppercase font-bold tracking-wider transition-all whitespace-nowrap ${activeView === 'google-import' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-400 bg-slate-50'}`}
          >
            Google Import
          </button>
          <button
            onClick={() => setActiveView('zoho-export')}
            className={`px-4 py-3 rounded-xl text-[10px] uppercase font-bold tracking-wider transition-all whitespace-nowrap ${activeView === 'zoho-export' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-400 bg-slate-50'}`}
          >
            Zoho Export
          </button>
          <button
            onClick={() => setActiveView('leads')}
            className={`px-4 py-3 rounded-xl text-[10px] uppercase font-bold tracking-wider transition-all whitespace-nowrap ${activeView === 'leads' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-400 bg-slate-50'}`}
          >
            Leads
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeView === 'google-import' && (
          <div className="space-y-8">
            {/* Auto Sync Status */}
            <section className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200 dark:border-slate-800 p-8 transition-all hover:shadow-2xl">
              <div className="flex flex-col md:flex-row gap-8 items-center justify-between">
                <div className="flex-1">
                  <h2 className="text-2xl font-bold mb-3 flex items-center gap-3 dark:text-white">
                    <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-xl">
                      <RefreshCw className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    Google Sheets Synchronization
                  </h2>
                  <p className="text-slate-600 dark:text-slate-400 mb-6 text-lg">
                    The system automatically monitors and imports data from your linked Google Sheet every 30 minutes.
                    <br />
                    <span className="text-sm text-slate-400 dark:text-slate-500 font-mono mt-2 block">Source: Architects & Designers INDIA 2</span>
                  </p>

                  <div className="flex gap-4">
                    <button
                      onClick={handleSync}
                      disabled={loading}
                      className={`px-8 py-4 rounded-2xl font-bold text-white shadow-xl transition-all active:scale-95 flex items-center gap-3
                            ${loading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-200'}
                          `}
                    >
                      {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                      {loading ? 'Processing Sync...' : 'Sync Data Now'}
                    </button>
                  </div>
                </div>

                <div className="flex gap-4">


                  <div className="bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-100 dark:border-slate-800 px-8 py-6 rounded-3xl text-center w-full md:w-auto md:min-w-[260px] shadow-inner">
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] font-black mb-2">System Pulse</div>
                    <div className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">
                      {history.length > 0 ? format(new Date(history[0].sync_timestamp), 'h:mm a') : '--:--'}
                    </div>
                    <div className="flex flex-col items-center gap-2 mt-4">
                      {history.length > 0 && (
                        <>
                          <div className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold shadow-sm 
                            ${history[0].status === 'SUCCESS' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                            {history[0].status === 'SUCCESS' ? 'Operational' : 'Sync Alert'}
                          </div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                            Trigger: {history[0].trigger_type || 'AUTO'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Sync Result Details */}
            {syncResult && (
              <section className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-emerald-100 dark:border-emerald-900/30 p-8 animate-in zoom-in duration-500">
                <h2 className="text-xl font-bold mb-6 text-emerald-600 dark:text-emerald-400 flex items-center gap-3">
                  <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-xl">
                    <Cloud className="w-5 h-5" />
                  </div>
                  Sync Successfully Completed
                </h2>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {syncResult.results.map((res, idx) => (
                    <div key={idx} className="border-2 border-slate-50 dark:border-slate-800 rounded-2xl p-5 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-white dark:hover:bg-slate-800 hover:border-emerald-100 dark:hover:border-emerald-900/50 transition-all group">
                      <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-3 flex justify-between items-center gap-3">
                        <span className="truncate">{res.sheet}</span>
                        <span className="shrink-0 text-[10px] bg-emerald-500 text-white px-2 py-1 rounded-lg">
                          +{res.inserted} new
                        </span>
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Verified {res.found || 0} records across the sheet.</p>
                      <div className="flex flex-wrap gap-1">
                        {res.columns && res.columns.slice(0, 5).map((col) => (
                          <span key={col} className="text-[9px] bg-white dark:bg-slate-700 border border-slate-100 dark:border-slate-600 text-slate-400 dark:text-slate-300 px-2 py-0.5 rounded uppercase font-bold">
                            {col}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Sync History & Detailed View */}
            <div className="grid lg:grid-cols-3 gap-8">
              {/* Sync Logs Table Panel */}
              <div className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-100 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col h-[600px]">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/20">
                  <div className="flex items-center gap-3">
                    <div className="bg-indigo-100 dark:bg-indigo-900/40 p-2.5 rounded-xl">
                      <Clock className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Sync Logs</h3>
                      <p className="text-xs text-slate-500 font-bold">History of Google Sheet Imports</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">

                    <button
                      onClick={() => fetchHistory()}
                      className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-slate-500 transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="overflow-auto flex-1 custom-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800">Date & Time</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800">Source</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800">Sheet Name</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">New Records</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Status</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((log) => (
                        <tr
                          key={log.id}
                          onClick={() => handleViewData(log)}
                          className={`group cursor-pointer transition-colors border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 ${selectedBatch?.id === log.id ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''}`}
                        >
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-700 dark:text-slate-300 text-sm">{format(new Date(log.sync_timestamp), 'dd MMM yyyy')}</span>
                              <span className="text-xs text-slate-400 font-medium">{format(new Date(log.sync_timestamp), 'h:mm a')}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wide bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              {log.trigger_type || 'MANUAL'} Import
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-bold text-slate-700 dark:text-slate-300 text-sm max-w-[200px] truncate block" title={log.sheet_name}>
                              {log.sheet_name}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-black
                                ${log.leads_inserted_count > 0 ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'}
                              `}>
                              {log.leads_inserted_count > 0 ? `+${log.leads_inserted_count}` : '0'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest
                                ${log.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'}
                              `}>
                              {log.status === 'SUCCESS' && <CheckCircle className="w-3 h-3" />}
                              {log.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              className="px-4 py-2 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold hover:border-indigo-500 hover:text-indigo-600 transition-colors shadow-sm group-hover:shadow-md"
                            >
                              View Records
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Detailed View Section */}
            {selectedBatch && (
              <section ref={detailsRef} className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-[600px] relative mt-8">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col gap-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-xl flex items-center gap-2">
                        {selectedBatch.sheet_name}
                      </h3>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
                        <span>Batch ID: <span className="font-mono text-slate-700 dark:text-slate-300">{selectedBatch.batch_id.slice(0, 8)}</span></span>
                        <span>•</span>
                        <span>Synced at: {format(new Date(selectedBatch.sync_timestamp), 'PPp')}</span>
                      </div>
                    </div>
                    <button onClick={closeDataView} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-all">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
                    <div className={`p-3 rounded-xl ${selectedBatch.leads_inserted_count > 0 ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                      <Database className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Records Added</p>
                      <p className="text-2xl font-black text-slate-900 dark:text-white leading-none mt-1">{selectedBatch.leads_inserted_count}</p>
                    </div>

                    <div className="h-10 w-px bg-slate-100 dark:bg-slate-800 mx-2"></div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Sync Status</p>
                      <p className={`text-base font-bold leading-tight mt-1 ${selectedBatch.status === 'SUCCESS' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                        {selectedBatch.status === 'SUCCESS' ? 'Completed Successfully' : 'Encountered Errors'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-auto bg-white dark:bg-slate-950 p-4">
                  {viewLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <RefreshCw className="w-10 h-10 text-indigo-500 animate-spin" />
                    </div>
                  ) : viewData.length > 0 ? (
                    <div className="rounded-2xl border-2 border-slate-50 dark:border-slate-800 overflow-hidden shadow-inner">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 dark:bg-slate-900 border-b-2 border-slate-100 dark:border-slate-800">
                            <tr>
                              {Object.keys(viewData[0] || {}).filter(k => !k.startsWith('_')).map(key => (
                                <th key={key} className="px-5 py-4 font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 whitespace-nowrap">{key}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                            {viewData.map((row, i) => (
                              <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800 transition-colors">
                                {Object.keys(row).filter(k => !k.startsWith('_')).map(key => (
                                  <td key={key} className="px-5 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400 max-w-[200px] truncate" title={row[key]}>{row[key]}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-60">
                      <Database className="w-12 h-12 text-slate-300 dark:text-slate-600" />
                      <p className="text-slate-500 dark:text-slate-400 font-medium">No new records were added in this specific batch.<br />(Or data was not retrievable)</p>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        )
        }

        {
          activeView === 'zoho-export' && (
            <div className="space-y-8">
              {/* Automated Sync Header */}
              <section className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl shadow-indigo-100 dark:shadow-none border border-slate-200 dark:border-slate-800 p-10 overflow-hidden relative">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                  <Share2 className="w-64 h-64 -mr-20 -mt-20 text-indigo-500" />
                </div>

                <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
                  <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full text-[10px] font-black uppercase tracking-widest mb-6 border border-indigo-100 dark:border-indigo-800">
                      <Zap className="w-3 h-3 fill-current" /> Intelligent CRM Automation
                    </div>
                    <h2 className="text-4xl font-black text-slate-800 dark:text-white leading-tight">
                      Zoho CRM <span className="text-indigo-600 dark:text-indigo-400">Live Pipeline</span>
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-4 text-lg font-medium leading-relaxed">
                      Lead synchronization is now fully autonomous. Our background engine monitors Sheet updates and handles CRM pushes instantly.
                    </p>

                    <div className="flex items-center gap-6 mt-8 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${zohoConnected ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)] animate-pulse' : 'bg-red-500'}`}></div>
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                          {zohoConnected ? 'Automation Engine: ACTIVE' : 'Automation Engine: OFFLINE'}
                        </span>
                      </div>
                      <div className="w-px h-4 bg-slate-200 dark:bg-slate-700"></div>
                      <div className="text-xs font-medium text-slate-400 uppercase tracking-tighter">
                        Last Active: {zohoHistory.length > 0 ? 'Just Now' : 'Idle'}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
                    {!zohoConnected && (
                      <button
                        onClick={handleConnectZoho}
                        className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-indigo-200 dark:shadow-none"
                      >
                        Activate Engine
                      </button>
                    )}
                    <button
                      onClick={handleStageLeads}
                      disabled={zohoLoading || stagingProcessing}
                      className="px-8 py-4 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-indigo-200 transition-all flex items-center justify-center gap-3 shadow-sm"
                    >
                      {stagingProcessing ? <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" /> : <RefreshCw className="w-4 h-4" />}
                      Re-scan Sheets
                    </button>
                  </div>
                </div>
              </section>

              {/* Simplified Sync Status */}
              {/* Real-time Status Counters */}
              <div className="grid lg:grid-cols-3 gap-6">
                {[
                  { label: 'Synced to CRM', status: 'Success', icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', darkBg: 'dark:bg-emerald-900/20' },
                  { label: 'Failed Pushes', status: 'Failed', icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50', darkBg: 'dark:bg-red-900/20' },
                  { label: 'Pending Automation', status: 'Pending', icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50', darkBg: 'dark:bg-amber-900/20' }
                ].map((item) => {
                  const count = zohoStats.find(s => s.status === item.status)?.count || 0;
                  const Icon = item.icon;
                  return (
                    <div key={item.status} className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-800 flex items-center gap-6 group hover:border-indigo-100 dark:hover:border-indigo-900/30 transition-all">
                      <div className={`p-4 rounded-2xl ${item.bg} ${item.darkBg} ${item.color} group-hover:scale-110 transition-transform`}>
                        <Icon className="w-8 h-8" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-1">{item.label}</p>
                        <h4 className="text-3xl font-black text-slate-800 dark:text-white tracking-tighter">{count.toLocaleString()}</h4>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Main Records Display */}
              <div className="space-y-6">
                {/* Sync Exceptions Detected (Actionable Failures) */}
                {zohoLeads.filter(l => l.crm_status === 'Failed').length > 0 && (
                  <section className="bg-red-50/30 dark:bg-red-950/10 rounded-[2.5rem] border-2 border-red-100 dark:border-red-900/30 overflow-hidden shadow-2xl shadow-red-100/50 dark:shadow-none animate-in slide-in-from-top-4 duration-500">
                    <div className="p-8 border-b border-red-100 dark:border-red-900/30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                      <div className="flex items-center gap-5">
                        <div className="bg-red-500 p-3 rounded-2xl text-white shadow-lg shadow-red-500/30">
                          <AlertTriangle className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-xl font-black text-red-900 dark:text-red-400 tracking-tight">Sync Exceptions Detected</h3>
                          <p className="text-sm text-red-600/70 dark:text-red-500/60 font-medium">Automatic push failed for the following records. Manual intervention recommended.</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handlePushAllToZoho()}
                        disabled={stagingProcessing}
                        className="w-full sm:w-auto px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-lg shadow-red-200 dark:shadow-none disabled:opacity-50"
                      >
                        {stagingProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Retry All Failures
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-red-100/20 dark:bg-red-900/10 text-[10px] uppercase font-black tracking-widest text-red-500 dark:text-red-400 border-b border-red-100 dark:border-red-900/30">
                          <tr>
                            <th className="px-10 py-5">Issue Details</th>
                            <th className="px-6 py-5">Error Log</th>
                            <th className="px-10 py-5 text-right">Resolution</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-red-100 dark:divide-red-900/30">
                          {zohoLeads.filter(l => l.crm_status === 'Failed').slice(0, 5).map((lead) => (
                            <tr key={lead.id} className="hover:bg-red-100/10 dark:hover:bg-red-900/20 transition-colors">
                              <td className="px-10 py-6">
                                <div className="font-bold text-slate-800 dark:text-slate-200">{lead.first_name} {lead.last_name}</div>
                                <div className="text-[11px] text-slate-400 font-mono mt-1">{lead.email || 'no-email'}</div>
                              </td>
                              <td className="px-6 py-6 font-mono">
                                <div className="text-[11px] text-red-600 bg-white dark:bg-slate-900 p-3 rounded-xl border border-red-100 dark:border-red-900/50 shadow-inner max-w-md">
                                  {lead.error_message || 'Unexpected API Timeout'}
                                </div>
                              </td>
                              <td className="px-10 py-6 text-right">
                                <button
                                  onClick={() => handleZohoSyncSingle(lead)}
                                  className="p-3 bg-white dark:bg-slate-800 text-red-600 hover:bg-red-600 hover:text-white border-2 border-red-100 dark:border-red-900/50 rounded-2xl transition-all shadow-sm"
                                  title="Force Sync"
                                >
                                  <ArrowRight className="w-5 h-5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {/* Pending Automation Queue (The 'Live' part) */}
                {zohoLeads.filter(l => l.crm_status === 'Pending').length > 0 && (
                  <section className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-xl border border-slate-100 dark:border-slate-800 overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
                    <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/30 dark:bg-slate-800/20">
                      <div className="flex items-center gap-5">
                        <div className="bg-amber-500 p-3 rounded-2xl text-white shadow-lg shadow-amber-500/20">
                          <Clock className="w-6 h-6 animate-spin-slow" />
                        </div>
                        <div>
                          <h3 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">Pending Automation Queue</h3>
                          <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">These records are staged and will be pushed to CRM in the next cycle.</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="px-4 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-xl text-[10px] font-black uppercase tracking-widest">
                          {zohoLeads.filter(l => l.crm_status === 'Pending').length} Records Waiting
                        </span>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50/50 dark:bg-slate-900/50 text-[10px] uppercase font-black tracking-widest text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                          <tr>
                            <th className="px-10 py-5">Lead Identity</th>
                            <th className="px-6 py-5">Classification</th>
                            <th className="px-10 py-5 text-right">Instant Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                          {zohoLeads.filter(l => l.crm_status === 'Pending').slice(0, 5).map((lead) => (
                            <tr key={lead.id} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors group">
                              <td className="px-10 py-6">
                                <div className="font-bold text-slate-800 dark:text-slate-200">{lead.first_name} {lead.last_name}</div>
                                <div className="text-[11px] text-slate-400 font-mono mt-1">{lead.email || 'no-email'}</div>
                              </td>
                              <td className="px-6 py-6">
                                <div className="flex gap-2">
                                  {lead.lead_type && (
                                    <span className="text-[9px] font-black text-indigo-500 uppercase tracking-tighter bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-lg border border-indigo-100/50">
                                      {lead.lead_type}
                                    </span>
                                  )}
                                  {lead.city && (
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter bg-white dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-100">
                                      {lead.city}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-10 py-6 text-right">
                                <button
                                  onClick={() => handleZohoSyncSingle(lead)}
                                  className="p-3 bg-white dark:bg-slate-800 text-indigo-600 hover:bg-indigo-600 hover:text-white border-2 border-indigo-50 dark:border-indigo-900/30 rounded-2xl transition-all shadow-sm group-hover:scale-110"
                                  title="Push Now (Bypass Queue)"
                                >
                                  <Zap className="w-5 h-5 fill-current" />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {zohoLeads.filter(l => l.crm_status === 'Pending').length > 5 && (
                            <tr>
                              <td colSpan="3" className="px-10 py-4 bg-slate-50/50 dark:bg-slate-900/50 text-center">
                                <button
                                  onClick={() => setActiveView('leads')}
                                  className="text-[10px] font-black text-slate-400 hover:text-indigo-600 uppercase tracking-[0.2em] transition-colors"
                                >
                                  + View {zohoLeads.filter(l => l.crm_status === 'Pending').length - 5} more in record database
                                </button>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {/* Automation Status Banner */}
                <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="bg-emerald-500 p-2.5 rounded-2xl text-white shadow-lg shadow-emerald-500/20">
                      <Cloud className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                      <h4 className="font-bold text-emerald-900 dark:text-emerald-400">Live CRM Pipeline Active</h4>
                      <p className="text-sm text-emerald-600/70 dark:text-emerald-500/50 font-medium tracking-tight">Leads are being synchronized automatically as they enter the staging table.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
                    <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-500 tracking-widest">System Operational</span>
                  </div>
                </div>
              </div>

              {/* Recent Zoho Success History */}
              <section className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-xl">
                      <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 dark:text-slate-200">Recent CRM Success History</h3>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-black">Showing records synced today</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleZohoUndoAll}
                      disabled={zohoHistoryLoading || zohoHistory.length === 0}
                      className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30 rounded-xl text-[10px] font-black uppercase tracking-tighter hover:bg-red-600 hover:text-white transition-all disabled:opacity-30"
                      title="Undo All (Move back to Staging)"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Undo All
                    </button>
                    <button
                      onClick={fetchZohoHistory}
                      disabled={zohoHistoryLoading}
                      className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all"
                    >
                      <RefreshCw className={`w-4 h-4 text-slate-400 ${zohoHistoryLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                  {zohoHistoryLoading && zohoHistory.length === 0 ? (
                    <div className="py-20 flex flex-col items-center justify-center space-y-3">
                      <div className="w-10 h-10 border-4 border-emerald-100 border-t-emerald-500 rounded-full animate-spin"></div>
                      <p className="text-sm font-bold text-slate-400">Fetching history...</p>
                    </div>
                  ) : zohoHistory.length === 0 ? (
                    <div className="py-20 flex flex-col items-center justify-center space-y-3 opacity-30 text-center">
                      <Cloud className="w-12 h-12 text-slate-300" />
                      <p className="text-sm font-bold text-slate-400">No history found.<br />Start syncing leads to see them here.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left">
                      <thead className="bg-slate-50/50 dark:bg-slate-900/50 text-[10px] uppercase font-black tracking-widest text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                        <tr>
                          <th className="px-8 py-5">Full Identity</th>
                          <th className="px-6 py-5">Contact Info</th>
                          <th className="px-6 py-5">Organization & Details</th>
                          <th className="px-6 py-5">Sync Metadata</th>
                          <th className="px-8 py-5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                        {zohoHistory.map((lead) => (
                          <tr key={lead.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/30 transition-colors group">
                            <td className="px-8 py-6">
                              <div className="font-bold text-slate-800 dark:text-slate-200">{lead.first_name} {lead.last_name}</div>
                              {lead.email && <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center gap-1.5 opacity-70 group-hover:opacity-100 transition-opacity">
                                <FileText className="w-3 h-3" /> {lead.email}
                              </div>}
                            </td>
                            <td className="px-6 py-6">
                              <div className="flex flex-col gap-1.5">
                                <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                  <div className="p-1 bg-slate-100 dark:bg-slate-800 rounded-md">
                                    <Phone className="w-3 h-3 text-slate-500" />
                                  </div>
                                  {lead.phone || 'No Phone'}
                                </div>
                                {lead.city && <div className="text-[10px] text-slate-400 flex items-center gap-2 pl-7">
                                  <MapPin className="w-2.5 h-2.5" /> {lead.city}
                                </div>}
                              </div>
                            </td>
                            <td className="px-6 py-6 font-mono">
                              <div className="text-xs text-slate-600 dark:text-slate-400 font-bold mb-1.5">{lead.company || '-'}</div>
                              <div className="flex flex-wrap gap-1">
                                {lead.lead_type && (
                                  <div className="text-[9px] font-black text-indigo-500 uppercase tracking-tighter bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-lg border border-indigo-100/50 dark:border-indigo-900/30">
                                    {lead.lead_type}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-6">
                              <div className="flex flex-col gap-1">
                                <div className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-2 font-black">
                                  <Zap className="w-3.5 h-3.5 fill-current" /> ID: {lead.zoho_id || 'LOCAL'}
                                </div>
                                <div className="text-[10px] text-slate-400 font-bold flex items-center gap-2">
                                  <Clock className="w-3.5 h-3.5 opacity-50" />
                                  {lead.crm_insert_time ? format(new Date(lead.crm_insert_time), 'MMM d, h:mm a') : 'Recently'}
                                </div>
                              </div>
                            </td>
                            <td className="px-8 py-6 text-right">
                              <div className="flex flex-col items-end gap-2">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm">
                                  <Check className="w-3 h-3" /> Synced
                                </span>
                                <button
                                  onClick={() => handleZohoUndo(lead)}
                                  className="p-1.5 px-3 bg-slate-50 hover:bg-amber-50 text-slate-400 hover:text-amber-600 border border-slate-200 hover:border-amber-200 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-sm"
                                  title="Revert to Staging"
                                >
                                  <RotateCcw className="w-3 h-3" /> Rollback
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>

              {/* Lead Pipeline Analysis Section - Track CRM Movement */}
              <section className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col mt-8 animate-in fade-in slide-in-from-bottom-6 duration-1000">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-xl">
                      <Globe className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 dark:text-slate-200">CRM Export Analytics</h3>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-black">Tracking sync movements from staging to Zoho CRM</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg text-[10px] font-bold text-slate-500">Live Counters</div>
                  </div>
                </div>
                <div className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="group bg-indigo-50/50 dark:bg-indigo-900/10 p-6 rounded-3xl border border-indigo-100/50 dark:border-indigo-900/30 hover:border-indigo-300 dark:hover:border-indigo-800 transition-all">
                      <div className="text-[10px] font-black uppercase text-indigo-400 tracking-[0.2em] mb-3">CRM Pushes (24h)</div>
                      <div className="flex items-end gap-2">
                        <div className="text-4xl font-black text-indigo-600 dark:text-indigo-400">{leadsStats?.movement?.pushed_today || 0}</div>
                        <div className="text-xs font-bold text-indigo-400 mb-1 flex items-center gap-0.5"><CheckCircle className="w-3 h-3" /> Sync</div>
                      </div>
                      <div className="text-[10px] mt-2 font-medium text-indigo-500/70 flex items-center gap-1.5 leading-relaxed">
                        Successfully exported today.
                      </div>
                    </div>

                    <div className="group bg-indigo-500 dark:bg-indigo-600 p-6 rounded-3xl border border-indigo-400 shadow-xl shadow-indigo-100 dark:shadow-none hover:translate-y-[-1px] transition-all">
                      <div className="text-[10px] font-black uppercase text-indigo-100/70 tracking-[0.2em] mb-3">Monthly Volume</div>
                      <div className="text-4xl font-black text-white">{(leadsStats?.movement?.pushed_month || 0).toLocaleString()}</div>
                      <div className="text-[10px] mt-2 font-medium text-indigo-100/80 flex items-center gap-1.5 leading-relaxed">
                        Records pushed this month.
                      </div>
                    </div>

                    <div className="group bg-slate-50 dark:bg-slate-800/80 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 hover:border-indigo-300 transition-all">
                      <div className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-3">Pipeline Queue</div>
                      <div className="flex items-end gap-3">
                        <div className="text-4xl font-black text-slate-800 dark:text-white leading-none">
                          {leadsStats?.movement?.pending_automation || 0}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-amber-500 uppercase">Pending</span>
                          <span className="text-[10px] font-black text-red-500 uppercase">{leadsStats?.movement?.failed_automation || 0} Failed</span>
                        </div>
                      </div>
                      <div className="text-[10px] mt-2 font-medium text-slate-400 flex items-center gap-1.5 leading-relaxed">
                        Leads awaiting background processing.
                      </div>
                    </div>
                  </div>

                  {/* Visual Divider / Footer info */}
                  <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                      <Clock className="w-3.5 h-3.5" />
                      PIPELINE HEALTH MONITORING ACTIVE
                    </div>
                    <div className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest px-4 py-1 bg-indigo-50 dark:bg-indigo-900/20 rounded-full">
                      Status: Performance Optimized
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )
        }

        {
          activeView === 'leads' && (
            <div className="space-y-8">
              {/* Leads Search & Control Bar */}
              <section className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="flex items-center gap-4 w-full md:w-2/3">
                  <div className="relative flex-1 group">
                    <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                      <Search className="w-5 h-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                    </div>
                    <input
                      type="text"
                      placeholder={`Search leads by ${leadsCategory === 'all' ? 'any field' : leadsCategory}...`}
                      value={leadsSearch}
                      onChange={(e) => {
                        setLeadsSearch(e.target.value);
                        setLeadsPage(0);
                      }}
                      className="w-full pl-14 pr-16 py-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-50 dark:border-slate-800 rounded-2xl outline-none focus:border-indigo-500 dark:focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-800 transition-all text-lg shadow-inner dark:text-white"
                    />
                    {leadsLoading && (
                      <div className="absolute inset-y-0 right-5 flex items-center">
                        <div className="w-5 h-5 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                      </div>
                    )}
                  </div>
                  <div className="h-10 w-[2px] bg-slate-100 dark:bg-slate-800 hidden md:block mx-2"></div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
                      <Filter className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <select
                      value={leadsCategory}
                      onChange={(e) => {
                        setLeadsCategory(e.target.value);
                        setLeadsPage(0);
                      }}
                      className="bg-transparent font-bold text-slate-700 dark:text-slate-300 outline-none text-sm cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    >
                      <option value="all">Everywhere</option>
                      <option value="name">Full Name</option>
                      <option value="email">Email</option>
                      <option value="city">City</option>
                      <option value="phone">Phone</option>
                      <option value="campaign">Campaign</option>
                      <option value="brand">Brand</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-xl font-black text-indigo-600 dark:text-indigo-400 leading-none">{totalLeads.toLocaleString()}</div>
                    <div className="text-[9px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest mt-1">Total Records</div>
                  </div>
                  <button
                    onClick={fetchLeads}
                    className="p-3 bg-indigo-600 text-white rounded-2xl shadow-xl shadow-indigo-100 dark:shadow-none hover:bg-indigo-700 active:scale-95 transition-all"
                  >
                    <RefreshCw className={`w-5 h-5 ${leadsLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </section>

              {/* Main Record Table */}
              <section className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden min-h-[600px] flex flex-col">
                <div className="flex-1 overflow-x-auto relative custom-scrollbar">
                  {leadsLoading && allLeads.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/50 dark:bg-slate-900/50 z-10 space-y-4">
                      <div className="w-16 h-16 border-8 border-indigo-100 dark:border-indigo-900/30 border-t-indigo-600 rounded-full animate-spin"></div>
                      <p className="font-bold text-slate-400 dark:text-slate-500">Loading Secure Database...</p>
                    </div>
                  ) : allLeads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-40 text-center space-y-4">
                      <Database className="w-20 h-20 text-slate-100 dark:text-slate-800" />
                      <div className="space-y-1">
                        <p className="text-xl font-bold text-slate-800 dark:text-slate-200">No Records Found</p>
                        <p className="text-slate-400 dark:text-slate-500">We couldn't find any results matching your current search parameters.</p>
                      </div>
                      <button onClick={() => setLeadsSearch('')} className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-indigo-700">Clear Search</button>
                    </div>
                  ) : (
                    <table className="w-full text-sm text-left">
                      <thead className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 bg-slate-50/80 dark:bg-slate-900/80 sticky top-0 z-20 backdrop-blur-md border-b-2 border-slate-100 dark:border-slate-800">
                        <tr>
                          <th className="px-8 py-5">Full Identity</th>
                          <th className="px-6 py-5">Contact Details</th>
                          <th className="px-6 py-5">Organization & Brand</th>
                          <th className="px-6 py-5">Location</th>
                          <th className="px-6 py-5">Campaign Info</th>
                          <th className="px-6 py-5 text-right pr-8">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y-2 divide-slate-50 dark:divide-slate-800">
                        {allLeads.map((lead) => {
                          // Dynamic lookups
                          const f = (p) => {
                            const matchingKeys = Object.keys(lead).filter(x => p.some(s => x.toLowerCase().includes(s.toLowerCase())));
                            for (const k of matchingKeys) {
                              if (lead[k] !== null && lead[k] !== undefined && String(lead[k]).trim() !== '') {
                                return lead[k];
                              }
                            }
                            return null;
                          };
                          const n = f(['full_name', 'name', 'contact']);
                          const e = f(['email', 'mail']);
                          const pRaw = f(['phone', 'mobile']);
                          const p = pRaw ? String(pRaw).replace(/^p:/i, '') : null;
                          const c = f(['company', 'brand', 'firm']);
                          const city = f(['city', 'distt', 'dist']);
                          const camp = lead.campaign_name || lead.form_name || 'Generic';

                          return (
                            <tr key={lead.sheet_id} className="hover:bg-indigo-50/20 dark:hover:bg-indigo-900/10 transition-all group">
                              <td className="px-8 py-5">
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center font-bold text-sm shadow-sm">
                                    {n ? n.charAt(0).toUpperCase() : '?'}
                                  </div>
                                  <div>
                                    <div className="font-bold text-slate-900 dark:text-slate-200 text-base">{n || 'Unidentified'}</div>
                                    <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono flex items-center gap-1">
                                      <Share2 className="w-2.5 h-2.5" /> {(lead.sheet_id || 'no-id').toString().slice(0, 12)}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-5">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                    <FileText className="w-3.5 h-3.5 opacity-40" /> {e || 'No Email'}
                                  </div>
                                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                                    <Share2 className="w-3.5 h-3.5 opacity-40 rotate-90" /> {p || 'No Phone'}
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-5">
                                <div className="inline-flex flex-col">
                                  <span className={`font-bold ${c ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'}`}>{c || '-'}</span>
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Platform ID: {lead.platform || 'N/A'}</span>
                                </div>
                              </td>
                              <td className="px-6 py-5">
                                <div className="flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></div>
                                  <span className="font-bold text-slate-700 dark:text-slate-300 capitalize">{city || 'Global'}</span>
                                </div>
                              </td>
                              <td className="px-6 py-5">
                                <div className="max-w-[180px] truncate" title={camp}>
                                  <div className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase mb-0.5 truncate">{camp}</div>
                                  <div className="text-[9px] text-slate-400 dark:text-slate-500 font-medium">
                                    {lead._created_at ? format(new Date(lead._created_at), 'MMM d, yyyy') : 'No Date'}
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-5 text-right pr-8">
                                <button
                                  onClick={() => handleDelete(lead)}
                                  className="p-2.5 text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                                  title="Delete Record"
                                >
                                  <Trash2 className="w-5 h-5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Table Footer / Pagination */}
                <div className="px-8 py-5 bg-slate-50 dark:bg-slate-900/50 border-t-2 border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="text-xs font-bold text-slate-400 dark:text-slate-500">
                    SYSTEM PAGE <span className="text-indigo-600 dark:text-indigo-400">{leadsPage + 1}</span>
                    <span className="mx-3 opacity-20">|</span>
                    TOTAL CAPACITY <span className="text-slate-900 dark:text-white">{totalLeads.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setLeadsPage(p => p - 1)}
                      disabled={leadsPage === 0}
                      className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-indigo-500 dark:hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm active:scale-90 dark:text-white"
                    >
                      <ChevronRight className="w-5 h-5 rotate-180" />
                    </button>
                    <div className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-black text-sm shadow-md shadow-indigo-100 dark:shadow-none">
                      {leadsPage + 1}
                    </div>
                    <button
                      onClick={() => setLeadsPage(p => p + 1)}
                      disabled={(leadsPage + 1) * leadsLimit >= totalLeads}
                      className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-indigo-500 dark:hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm active:scale-90 dark:text-white"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </section>
            </div>
          )
        }

        {/* Maintenance & Configuration Panels (Visible everywhere) */}
        {
          (activeView === 'google-import' || activeView === 'zoho-export') && (
            <div className="grid md:grid-cols-2 gap-8 mt-12">
              <section className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 p-8">
                <h2 className="text-xl font-bold mb-6 text-red-600 dark:text-red-400 flex items-center gap-3">
                  <Trash2 className="w-6 h-6" />
                  Registry Maintenance
                </h2>
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 mb-2 ml-1">Archive ID (Sheet ID)</label>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        type="text"
                        value={deleteInputId}
                        onChange={(e) => setDeleteInputId(e.target.value)}
                        placeholder="EX: 1234567-890"
                        className="flex-1 px-5 py-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl outline-none focus:border-red-500 dark:focus:border-red-400 focus:bg-white dark:focus:bg-slate-800 transition-all font-mono dark:text-white"
                      />
                      <button
                        onClick={handleManualDelete}
                        disabled={loading}
                        className="px-6 py-4 bg-slate-900 dark:bg-slate-700 text-white rounded-2xl font-bold hover:bg-red-600 dark:hover:bg-red-500 transition-colors shadow-lg active:scale-95 disabled:opacity-50"
                      >
                        Remove Record
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                    Deleting a record here will remove it from the database and prevent it from being re-synced in the future. Use this to permanently filter out bad data.
                  </p>
                </div>
              </section>

              <section className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 p-8">
                <h2 className="text-xl font-bold mb-6 text-indigo-600 dark:text-indigo-400 flex items-center gap-3">
                  <HelpCircle className="w-6 h-6" />
                  Sync Configuration
                </h2>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-tighter">Auto-Sync Interval</span>
                    <span className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-full font-bold shadow-sm shadow-indigo-200">30 Minutes</span>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-tighter">Source Identity</span>
                    <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400">Arch...NDIA 2</span>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 italic text-center px-4">
                    The system pulse is managed by GitHub Actions workflows for maximum reliability and uptime.
                  </p>
                </div>
              </section>
            </div>
          )
        }
      </main >
      <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
        <p>© 2026 SyncFlow Automation System</p>
        <p>Admin Support: <a href="mailto:mansikharb.kc@gmail.com" className="text-indigo-500 dark:text-indigo-400 hover:underline">mansikharb.kc@gmail.com</a></p>
      </div>
    </div >
  );
}

export default App;
