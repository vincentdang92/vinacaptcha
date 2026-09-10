const fs = require('fs');

function replaceFile(path, replacements) {
  let content = fs.readFileSync(path, 'utf8');
  for (const r of replacements) {
    content = content.replace(r.search, r.replace);
  }
  fs.writeFileSync(path, content, 'utf8');
}

replaceFile('src/contexts/color-mode/index.tsx', [
  { search: /import React, \{ createContext, useEffect, useState \} from 'react';\nimport type \{ PropsWithChildren \} from 'react';/, replace: "import React, { createContext, useState } from 'react';\nimport type { PropsWithChildren } from 'react';" },
  { search: /import React, \{ PropsWithChildren, createContext, useEffect, useState \} from 'react';/, replace: "import React, { createContext, useState } from 'react';\nimport type { PropsWithChildren } from 'react';" }
]);

replaceFile('src/pages/ip-reputation/index.tsx', [
  { search: /loading=\{queryResult\?\.isLoading\}/, replace: "" }
]);

replaceFile('src/pages/login/index.tsx', [
  { search: /import \{ useState, useEffect \} from 'react';/, replace: "import { useState } from 'react';" }
]);

replaceFile('src/pages/sites/list.tsx', [
  { search: /import \{ Table, Space, Button, Tag, Drawer \} from "antd";/, replace: "import { Table, Space, Button, Tag } from 'antd';" },
  { search: /import \{ EditOutlined, DeleteOutlined, PlusOutlined, CodeOutlined \} from "@ant-design\/icons";/, replace: "import { EditOutlined, DeleteOutlined, CodeOutlined } from '@ant-design/icons';" },
  { search: /import \{ Table, Space, Button, Tag \} from 'antd';/, replace: "import { Table, Space, Button, Tag } from 'antd';" },
  { search: /import \{ EditOutlined, DeleteOutlined, CodeOutlined \} from '@ant-design\/icons';/, replace: "import { EditOutlined, DeleteOutlined, CodeOutlined } from '@ant-design/icons';" }
]);

replaceFile('src/pages/sites/show.tsx', [
  { search: /import \{ Typography, Card, Space, Tag, Button \} from 'antd';/, replace: "import { Typography, Card, Space, Tag } from 'antd';" },
  { search: /import \{ Typography, Card, Space, Tag, Button \} from "antd";/, replace: "import { Typography, Card, Space, Tag } from 'antd';" },
  { search: /import \{ GlobalOutlined, KeyOutlined, DeleteOutlined, PlusOutlined \} from "@ant-design\/icons";/, replace: "import { GlobalOutlined, KeyOutlined } from '@ant-design/icons';" }
]);

replaceFile('src/pages/threat-intel/index.tsx', [
  { search: /import \{ Row, Col, Card, Typography, Table, Tag, Switch, Badge, Tooltip \} from 'antd';/, replace: "import { Row, Col, Card, Typography, Table, Tag, Switch } from 'antd';" }
]);
