import { MDBIcon } from 'mdb-react-ui-kit';
import React, { useEffect, useState } from 'react'
import { useHistory, useLocation } from 'react-router-dom';
import './header.styles.scss';
const Header = () => {
    const [headerTitle, setHeaderTitle] = useState<string>();
    const [displayBackBtn, setDisplayBackBtn] = useState(false);
    const location = useLocation();
    const history = useHistory();


    useEffect(() => {
        let backBtnFlag = false;
        
        if (location.pathname.endsWith('/')) {
            setHeaderTitle('Food This Week')
        } else if (location.pathname.includes('food-details')) {
            backBtnFlag = true;
            setHeaderTitle('Food Details')
        } else if (location.pathname.includes('to-buy-list')) {
            setHeaderTitle('To Buy List')
        }
        else {
            setHeaderTitle('Smart Menu')
        }
        
        setDisplayBackBtn(backBtnFlag)
        return () => {

        }
    }, [location])

    return (
        <header className="header">
            {
                displayBackBtn
                    ? <MDBIcon 
                        className="back-btn" 
                        fas 
                        icon="arrow-left" 
                        size='2x'
                        onClick={() => history.goBack()}
                        />
                    : null
            }

            <h1>{headerTitle}</h1>
        </header>
    )
}

export default Header