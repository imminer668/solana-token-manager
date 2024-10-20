import { Box, Container, Heading, Tabs, TabList, TabPanels, Tab, TabPanel } from '@chakra-ui/react';
import { WalletButton } from '../components/WalletButton';
import { CreateToken } from '../components/CreateToken';
import { MintToken } from '../components/MintToken';
import { useWallet } from '@solana/wallet-adapter-react';
import { TokenList } from '../components/TokenList';

export default function Home() {
    const { publicKey } = useWallet();

    return (
        <Container maxW="container.xl" py={8}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={8}>
                <Heading as="h1" size="lg">Solana Token Manager</Heading>
                <WalletButton />
            </Box>
            
            {publicKey && (
                <Box mt={4}>
                    <Heading as="h3" size="md" mb={2}>
                        当前钱包地址: {publicKey.toString()}
                    </Heading>
                    
                    <Tabs mt={6}>
                        <TabList>
                            <Tab>代币列表</Tab>
                            <Tab>创建代币&关联ATA账户</Tab>
                            <Tab>铸造代币</Tab>
                        </TabList>

                        <TabPanels>
                            <TabPanel>
                                <TokenList />
                            </TabPanel>
                            <TabPanel>
                                <CreateToken />
                            </TabPanel>
                            <TabPanel>
                                
                            </TabPanel>
                        </TabPanels>
                    </Tabs>
                </Box>
            )}
        </Container>
    );
} 