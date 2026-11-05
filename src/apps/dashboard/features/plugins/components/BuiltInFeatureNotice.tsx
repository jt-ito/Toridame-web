import Alert from '@mui/material/Alert';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import React, { useCallback, useState } from 'react';

import { getEpisodeListSettings, setEpisodeListSetting } from 'components/episodeList/episodeListSettings';
import globalize from 'lib/globalize';

/**
 * Tells the admin the plugin's feature is built in now, and lets them keep using the plugin's button on this device.
 * Disabling the plugin (the switch further down the page) hands the player over to the built-in list for everyone.
 */
const BuiltInFeatureNotice = () => {
    const [ usePlugin, setUsePlugin ] = useState(getEpisodeListSettings().source !== 'native');

    const onChange = useCallback((_: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
        setEpisodeListSetting('source', checked ? 'plugin' : 'native');
        setUsePlugin(checked);
    }, []);

    return (
        <Alert severity='success' sx={{ marginBottom: 2 }}>
            {globalize.translate('PluginBuiltInNotice')}
            <br />
            <FormControlLabel
                control={<Switch checked={usePlugin} onChange={onChange} />}
                label={globalize.translate('PluginBuiltInUsePlugin')}
            />
        </Alert>
    );
};

export default BuiltInFeatureNotice;
