import { getDisplayVersion } from '@jellyfin/sdk/lib/utils/versioning';
import Box from '@mui/material/Box';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import React from 'react';

import { isNewerVersion, useLatestRelease } from 'hooks/useLatestRelease';
import { useSystemInfo } from 'hooks/useSystemInfo';
import globalize from 'lib/globalize';
import ListItemLink from 'components/ListItemLink';

import appIcon from '@jellyfin/ux-web/icon-transparent.png';

const DrawerHeaderLink = () => {
    const { data: systemInfo } = useSystemInfo();
    const { data: latestRelease } = useLatestRelease();
    const hasUpdate = isNewerVersion(latestRelease?.version, systemInfo?.Version);

    return (
        <ListItemLink to='/'>
            <ListItemIcon sx={{ minWidth: 56 }}>
                <Box
                    component='img'
                    src={appIcon}
                    sx={{ height: '2.5rem' }}
                />
            </ListItemIcon>
            <ListItemText
                primary={systemInfo?.ServerName || 'Toridame'}
                secondary={hasUpdate ?
                    globalize.translate('UpdateAvailableVersion', latestRelease?.version) :
                    getDisplayVersion(systemInfo?.Version)}
                slotProps={{
                    primary: { variant: 'h6' },
                    secondary: hasUpdate ? { sx: { color: 'success.main', fontWeight: 'bold' } } : undefined
                }}
            />
        </ListItemLink>);
};

export default DrawerHeaderLink;
