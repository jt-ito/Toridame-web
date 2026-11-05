import ExtensionIcon from '@mui/icons-material/Extension';
import Chip from '@mui/material/Chip';
import React, { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import BaseCard from 'apps/dashboard/components/BaseCard';
import globalize from 'lib/globalize';

import { isBuiltInFeature } from '../utils/builtInFeature';

import { PluginDetails } from '../types/PluginDetails';

interface PluginCardProps {
    plugin: PluginDetails;
};

const PluginCard = ({ plugin }: PluginCardProps) => {
    const location = useLocation();

    const pluginPage = useMemo(() => (
        {
            pathname: `/dashboard/plugins/${plugin.id}`,
            search: `?name=${encodeURIComponent(plugin.name || '')}`,
            hash: location.hash
        }
    ), [ location, plugin ]);

    return (
        <BaseCard
            title={plugin.name}
            to={pluginPage}
            text={[plugin.version?.VersionNumber, plugin.status].filter(t => t).join(' ')}
            badge={isBuiltInFeature(plugin.id) && (
                <Chip
                    size='small'
                    color='success'
                    label={globalize.translate('PluginBuiltInBadge')}
                    sx={{ alignSelf: 'flex-start' }}
                />
            )}
            image={plugin.imageUrl}
            icon={<ExtensionIcon sx={{ width: 80, height: 80 }} />}
        />
    );
};

export default PluginCard;
