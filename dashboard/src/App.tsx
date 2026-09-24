import { Refine, Authenticated } from '@refinedev/core';
import dataProvider from '@refinedev/simple-rest';
import routerProvider, { CatchAllNavigate } from '@refinedev/react-router';
import { BrowserRouter, Route, Routes, Outlet } from 'react-router-dom';
import { App as AntdApp } from 'antd';
import {
  ThemedLayout,
  ThemedTitle,
  useNotificationProvider,
  ErrorComponent,
} from '@refinedev/antd';
import { GlobalOutlined, SafetyCertificateOutlined, DashboardOutlined, AlertOutlined, BookOutlined, ControlOutlined, MailOutlined } from '@ant-design/icons';
import axios from 'axios';

import { authProvider } from './authProvider';
import { LoginPage } from './pages/login';
import { RegisterPage } from './pages/register';
import { ForgotPasswordPage } from './pages/forgot-password';
import { ResetPasswordPage } from './pages/reset-password';
import { ActivatePage } from './pages/activate';
import { DashboardPage } from './pages/dashboard';
import { SiteList } from './pages/sites/list';
import { ThreatIntelPage } from './pages/threat-intel';
import { ApiDocsPage } from './pages/api-docs';
import { IpReputationPage } from './pages/ip-reputation';
import { RiskEnginePage } from './pages/risk-engine';
import { SmtpSettingsPage } from './pages/smtp-settings';
import { ColorModeContextProvider } from './contexts/color-mode';
import { Header } from './components/header';
import { AccountList } from './pages/accounts/list';
import { SetupWizardPage } from './pages/setup';
import { API_BASE_URL } from './config';

const API_URL = API_BASE_URL;

// Cấu Hình Axios global tự động đính kèm JWT Bearer token và xử lý 401
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('vinacaptcha_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('vinacaptcha_token');
      localStorage.removeItem('vinacaptcha_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

function App() {
  return (
    <BrowserRouter>
      <ColorModeContextProvider>
        <AntdApp>
          <Refine
            dataProvider={dataProvider(API_URL, axios)}
            routerProvider={routerProvider}
            authProvider={authProvider}
            notificationProvider={useNotificationProvider}
            resources={[
              {
                name: 'dashboard',
                list: '/',
                meta: {
                  label: 'Dashboard',
                  icon: <DashboardOutlined />,
                },
              },
              {
                name: 'sites',
                list: '/sites',
                meta: { label: 'Quản lý Sites', icon: <GlobalOutlined />, canDelete: true },
              },
              {
                name: 'threat-intel',
                list: '/threat-intel',
                meta: {
                  label: 'Threat Intelligence',
                  icon: <AlertOutlined />,
                },
              },
              {
                name: 'ip-reputation',
                list: '/ip-reputation',
                meta: {
                  label: 'IP Reputation',
                  icon: <SafetyCertificateOutlined />,
                },
              },
              {
                name: 'risk-engine',
                list: '/risk-engine',
                meta: {
                  label: 'Luật Risk Engine',
                  icon: <ControlOutlined />,
                },
              },
              {
                name: 'api-docs',
                list: '/api-docs',
                meta: {
                  label: 'API Docs',
                  icon: <BookOutlined />,
                },
              },
              {
                name: 'accounts',
                list: '/accounts',
                meta: {
                  label: 'Quản lý Users',
                  icon: <SafetyCertificateOutlined />,
                },
              },
              {
                name: 'smtp-settings',
                list: '/settings/smtp',
                meta: {
                  label: 'Cổng Email SMTP',
                  icon: <MailOutlined />,
                },
              },
            ]}
            accessControlProvider={{
              can: async ({ resource }) => {
                const adminOnlyResources = ['ip-reputation', 'risk-engine', 'accounts', 'smtp-settings'];
                
                if (resource && adminOnlyResources.includes(resource)) {
                  const userStr = localStorage.getItem("vinacaptcha_user");
                  if (userStr) {
                    try {
                      const user = JSON.parse(userStr);
                      return { can: user.role === 'admin' };
                    } catch {}
                  }
                  return { can: false };
                }
                return { can: true };
              }
            }}
            options={{
              syncWithLocation: true,
              warnWhenUnsavedChanges: true,
            }}
          >
              <Routes>
                {/* PUBLIC ROUTES */}
                <Route path="/setup" element={<SetupWizardPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/activate" element={<ActivatePage />} />

                {/* PROTECTED ROUTES */}
                <Route
                  element={
                    <Authenticated key="authenticated-routes" fallback={<CatchAllNavigate to="/login" />}>
                      <ThemedLayout
                        Header={Header}
                        Title={(props) => (
                          <ThemedTitle
                            {...props}
                            text="NhanHoaCaptcha"
                            icon={<SafetyCertificateOutlined style={{ color: '#7367f0', fontSize: '24px' }} />}
                          />
                        )}
                      >
                        <Outlet />
                      </ThemedLayout>
                    </Authenticated>
                  }
                >
                  <Route index element={<DashboardPage />} />
                  <Route path="sites">
                    <Route index element={<SiteList />} />
                  </Route>
                  <Route path="threat-intel" element={<ThreatIntelPage />} />
                  <Route path="ip-reputation" element={<IpReputationPage />} />
                  <Route path="risk-engine" element={<RiskEnginePage />} />
                  <Route path="api-docs" element={<ApiDocsPage />} />
                  <Route path="accounts">
                    <Route index element={<AccountList />} />
                  </Route>
                  <Route path="settings/smtp" element={<SmtpSettingsPage />} />
                  <Route path="*" element={<ErrorComponent />} />
                </Route>
              </Routes>
          </Refine>
        </AntdApp>
      </ColorModeContextProvider>
    </BrowserRouter>
  );
}

export default App;
