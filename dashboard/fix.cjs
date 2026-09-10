const fs = require('fs');

function replaceFile(path, replacements) {
  let content = fs.readFileSync(path, 'utf8');
  for (const r of replacements) {
    content = content.replace(r.search, r.replace);
  }
  fs.writeFileSync(path, content, 'utf8');
}

replaceFile('src/App.tsx', [
  { search: /import \{ ConfigProvider, App as AntdApp \} from 'antd';/, replace: "import { App as AntdApp } from 'antd';" },
  { search: /import \{ themeTokens \} from '.\/theme';\n/, replace: "" },
  { search: /import \{ SiteCreate \} from '.\/pages\/sites\/create';\n/, replace: "" },
  { search: /import \{ SiteEdit \} from '.\/pages\/sites\/edit';\n/, replace: "" },
  { search: /import \{ SiteShow \} from '.\/pages\/sites\/show';\n/, replace: "" }
]);

replaceFile('src/contexts/color-mode/index.tsx', [
  { search: /import React, \{ PropsWithChildren, createContext, useEffect, useState \} from 'react';/, replace: "import React, { createContext, useEffect, useState } from 'react';\nimport type { PropsWithChildren } from 'react';" }
]);

replaceFile('src/pages/api-docs/index.tsx', [
  { search: /import \{ Row, Col, Card, Typography, Tag, Tabs, Divider, Alert, Space, Button, message \} from "antd";/, replace: "import { Row, Col, Card, Typography, Tag, Tabs, Divider, Alert, Button } from 'antd';" },
  { search: /lang = "js" }: \{ code: string; lang\?: string \}/, replace: "}: { code: string; lang?: string }" }
]);

replaceFile('src/pages/ip-reputation/index.tsx', [
  { search: /const \{ tableProps, queryResult \} = useTable\(\{/, replace: "const { tableProps } = useTable({" }
]);

replaceFile('src/pages/login/index.tsx', [
  { search: /import \{ useState, useEffect \} from 'react';/, replace: "import { useState } from 'react';" }
]);

replaceFile('src/pages/risk-engine/index.tsx', [
  { search: /import \{ Card, Typography, Row, Col, Alert, Timeline, Tag, Descriptions, Divider \} from 'antd';/, replace: "import { Card, Typography, Row, Col, Alert, Timeline, Tag, Descriptions } from 'antd';" }
]);

replaceFile('src/pages/sites/edit.tsx', [
  { search: /import \{ Edit, useForm \} from "@refinedev\/antd";/, replace: "import { Edit } from '@refinedev/antd';" }
]);

replaceFile('src/pages/sites/list.tsx', [
  { search: /import \{ Table, Space, Button, Tag, Drawer \} from "antd";/, replace: "import { Table, Space, Button, Tag } from 'antd';" },
  { search: /import \{ EditOutlined, DeleteOutlined, PlusOutlined, CodeOutlined \} from "@ant-design\/icons";/, replace: "import { EditOutlined, DeleteOutlined, CodeOutlined } from '@ant-design/icons';" }
]);

replaceFile('src/pages/sites/show.tsx', [
  { search: /import \{ Typography, Card, Space, Tag, Button \} from "antd";/, replace: "import { Typography, Card, Space, Tag } from 'antd';" },
  { search: /import \{ GlobalOutlined, KeyOutlined, DeleteOutlined, PlusOutlined \} from "@ant-design\/icons";/, replace: "import { GlobalOutlined, KeyOutlined } from '@ant-design/icons';" }
]);

replaceFile('src/pages/threat-intel/index.tsx', [
  { search: /import \{ Row, Col, Card, Typography, Table, Tag, Switch, Badge, Tooltip \} from 'antd';/, replace: "import { Row, Col, Card, Typography, Table, Tag, Switch } from 'antd';" }
]);
